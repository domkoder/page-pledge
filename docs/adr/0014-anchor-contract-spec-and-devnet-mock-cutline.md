# 0014 — Locked Anchor `vault` instruction contract, `O(1)` settlement accumulators, and Devnet vs. Mock Sandbox cutline

**Status:** accepted (amends ADR 0004, ADR 0005, and ADR 0007)

## Context

With the pledge asset (Native SOL `lamports`, ADR 0010), milestone lifecycle (`commit_submission` + `complete_milestone` + `NEUTRAL` cohort-liveness check + `start_cohort`, ADR 0011), cohort intent & AI grading scope (`score >= 75`, ADR 0012), and end-of-cohort economics (`settle_user` -> `finalize` -> `claim`, ADR 0013) locked, we need the exact on-chain Anchor account layouts, instruction contract, and Devnet vs. Mock demo cutline ready to split into implementation tickets via `/to-tickets`.

## Decision

### 1. Single Anchor Program (`anchor/programs/vault/src/lib.rs`) with 8 Instructions

We cut the second mock-lender Anchor program (applying ADR 0004's cut-first rule) and ship a single, self-contained `vault` Anchor program on Solana Devnet with Codama client generation (`npm run codama`):

1. **`create_cohort(id, title, stake_lamports, milestone_count, max_participants, interval_seconds, grace_period_seconds, content_hash, oracle_pubkey, treasury)`**
   - Initializes `Cohort` PDA at `[b"cohort", creator.key().as_ref(), id.as_bytes()]`.
   - Creator transfers `Rent::get()?.minimum_balance(0)` into the 0-byte `SystemAccount` Vault PDA (`[b"vault", cohort.key().as_ref()]`) and records `vault_rent_reserve` on `Cohort`.
2. **`join()`**
   - Allowed while `status == Open` and `participant_count < max_participants`.
   - Initializes `Participant` PDA at `[b"participant", cohort.key().as_ref(), user.key().as_ref()]`.
   - Transfers `cohort.stake` lamports from `user` to `Vault` PDA via `SystemProgram::transfer`, incrementing `cohort.participant_count` and `cohort.total_deposits`.
3. **`start_cohort()`**
   - Allowed while `status == Open` and `participant_count >= 2`.
   - Callable by `cohort.creator` or any joined `participant` (verified via their `Participant` PDA).
   - Sets `status = Active`, `started_at = now`, and anchors `deadlines[i] = now + interval_seconds * (i + 1)`.
4. **`commit_submission(milestone_idx, answer_hash)`**
   - Allowed while `status == Active` (or auto-starts if `status == Open` and `participant_count >= 2`), `now <= deadlines[milestone_idx]`, milestone bit not set in `completed_bitmap`, and `attempt_count[milestone_idx] < 3`.
   - Stores `answer_hashes[milestone_idx] = answer_hash`, `commit_timestamps[milestone_idx] = now`, and increments `attempt_counts[milestone_idx]`.
5. **`complete_milestone(milestone_idx, score, expires_at, signature)`**
   - Allowed while `commit_timestamps[milestone_idx] > 0`, `commit_timestamps[milestone_idx] <= deadlines[milestone_idx]`, `now <= deadlines[milestone_idx] + grace_period_seconds`, `now <= expires_at`, and `score >= 75`.
   - Inspects the preceding instruction in the `Instructions` sysvar (`sysvar::instructions::ID`) to verify that `Ed25519SigVerify111111111111111111111111111` verified `cohort.oracle_pubkey`'s signature over the canonical `"PAGEPLEDGE_ATT_V1" || program_id || cluster_id || cohort_id || epoch || user || milestone_idx || score || commit_hash || expires_at` payload matching `answer_hashes[milestone_idx]`.
   - Sets bit `1 << milestone_idx` in `participant.completed_bitmap` and updates `cohort.last_oracle_ts = now`.
6. **`settle_user()`**
   - Permissionless once `now > deadlines[M - 1] + grace_period_seconds` (transitions `status` to `Settling` if `Active`) and `!participant.settled`.
   - Evaluates each milestone `0..M`:
     - `PASSED` if `(completed_bitmap & (1 << i)) != 0`
     - `NEUTRAL` if not passed, `commit_timestamps[i] > 0 && commit_timestamps[i] <= deadlines[i]`, and `cohort.last_oracle_ts < commit_timestamps[i]`
     - `MISSED` otherwise (`missed_count += 1`)
   - Computes `forfeit = (stake * missed_count) / M`, `bounty = min((forfeit * 100) / 10_000, 10_000_000)`, `net_forfeit = forfeit - bounty`, and `eligible = (passed_count == M && missed_count == 0)`.
   - Transfers `bounty` lamports from `Vault` PDA to `caller` via PDA seeds signer.
   - Updates **`O(1)` running accumulators on `Cohort` PDA**:
     - `settled_count += 1`
     - `total_forfeits += forfeit`
     - `total_bounties_paid += bounty`
     - `total_net_forfeits += net_forfeit`
     - `eligible_count += if eligible { 1 } else { 0 }`
     - `eligible_stake_sum += if eligible { stake } else { 0 }`
     - `total_preserved_stakes += stake - forfeit`
     - `total_no_eligible_refunds += (net_forfeit * 9_800) / 10_000`
7. **`finalize()`**
   - Permissionless once `settled_count == participant_count` and `status != Finalized` — requires **zero `remaining_accounts`** (`O(1)` accounts: `Cohort`, `Vault`, `Treasury`).
   - Reads `assets = vault.lamports().saturating_sub(cohort.vault_rent_reserve)` and `liabilities = total_deposits - total_bounties_paid`.
   - Computes `fee`, `pool`, `total_payouts`, and `dust = assets - total_payouts - fee` using the exact integer formulas in `lib/economics.ts` (`ADR 0013`) and `Cohort` accumulators.
   - Transfers `fee + dust` lamports from `Vault` PDA to `cohort.treasury` and sets `status = Finalized`.
8. **`claim()`**
   - Callable once by `participant.user` when `status == Finalized` and `!participant.claimed`.
   - Computes `participant.payout` from `participant` state and `cohort`'s finalized `pool` / `eligible_stake_sum` / `assets` / `liabilities`, marks `claimed = true`, and transfers `payout` lamports from `Vault` PDA to `user`.

### 2. Dual-Mode UI (`Devnet Live` vs. `Mock Sandbox`) & Unified In-Browser Keeper

- The UI provides an explicit mode toggle (`Devnet Live` backed by `SolanaChain` + connected wallet vs. `Mock Sandbox` backed by `MockChain`) in addition to `NEXT_PUBLIC_CHAIN=mock|devnet` default selection.
- **Devnet Live mode** executes real on-chain transactions on Solana Devnet (using 2-minute fast-mode milestones for live demoability).
- **Mock Sandbox mode** powers instant clock time-travel (`+1h`, jump to deadline, jump past grace), 6 built-in personas with 10 SOL faucets, interactive DeFi Yield (`aprBps`) & Lender-Loss Haircut (`h = min(1, A/U)`) sliders, 4 Scenario Presets, and the 9-vector Security Demo table.
- **Unified Keeper:** The in-browser Keeper auto-sweeper tab operates against `ChainClient` (`settleUser` and `finalize`) in both modes without needing a separate standalone Node CLI process.

## Consequences

- Every decision on the Wayfinder map is resolved and reconciled across `CONTEXT.md` and `docs/adr/0001`–`0014`.
- The specification is ready to hand off to `/to-tickets` for implementation.
