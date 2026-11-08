# 0013 — End-of-cohort settlement, proportional forfeiture (`1/M`), 200 bps protocol fee, and 100 bps keeper bounty

**Status:** accepted (supersedes ADR 0006; amends ADR 0007 and ADR 0009)

## Context

ADR 0006, ADR 0007, and ADR 0009 originally described per-`(cohort, milestone, wallet)` settlement after every milestone's grace window, a creator-configurable `forfeit_bps`, 0% protocol fee, no keeper bounty, and rounding dust sent to the last claimer. Meanwhile, `p1.md`, `lib/economics.ts`, and `MockChain` implement a complete, property-tested economic model with fixed `1/M` proportional forfeiture per missed milestone, a 100 bps permissionless `settle_user` bounty, a fixed 200 bps protocol fee, rounding dust to Treasury, lender-loss haircut math (`h = min(1, A/U)`), and end-of-cohort settlement (`settle_user` -> `finalize` -> `claim`).

## Decision

1. **Proportional Forfeiture (`1/M` per missed milestone):**
   - For a participant with stake `S_i` (in lamports) and `missed_i` missed milestones out of `M`, total forfeiture is fixed at:
     `F_i = floor(S_i * missed_i / M)`
   - Missing all `M` milestones forfeits 100% of stake; `forfeit_bps` is not creator-configurable.
2. **Keeper Settle Bounty (`100 bps` capped at `0.01 SOL`):**
   - Calling `settle_user` for a participant pays the caller a permissionless bounty out of `F_i`:
     `bounty_i = min(floor(F_i * 100 / 10_000), 10_000_000n)` lamports (`0.01 SOL` max cap).
   - Net forfeit is `N_i = F_i - bounty_i`.
3. **Protocol Fee (`200 bps`), Reward Pool, Haircut, and Dust to Treasury:**
   - Liabilities `U = sum(S_i) - B` (where `B = sum(bounty_i)`), Assets `A = actual vault pledged lamports at finalize`.
   - Haircut `h = min(1, A / U)`, Yield `Y = max(A - U, 0)`.
   - Protocol fee `fee = floor(h * floor(sum(N_i) * 200 / 10_000))` (`200 bps` = 2.00%, fixed by protocol).
   - If at least one participant is **eligible** (`missed_i == 0` and all `M` milestones `PASSED`, i.e., no `NEUTRAL` milestones), `Pool = floor(h * (sum(N_i) - rawFee)) + Y` is distributed pro-rata by stake (`floor(Pool * S_i / eligibleStakeSum)`).
   - **No-eligible fallback:** If zero participants passed all `M` milestones, each participant receives `floor(h * (S_i - F_i)) + floor(h * floor(N_i * 9_800 / 10_000))`, and `Y` is swept to Treasury.
   - All integer division remainders (`dust = A - sum(payouts) - fee`) go to Treasury, guaranteeing the solvency invariant **`sum(payouts) + fee + dust == A`** to the exact lamport.
4. **End-of-Cohort Settlement Granularity (`settle_user` -> `finalize` -> `claim`):**
   - `settle_user` is callable permissionlessly **once per participant** after the final milestone's window closes (`now > deadlines[M - 1] + gracePeriodSeconds`).
   - `finalize` is callable permissionlessly once all joined participants are settled, locking payouts and transferring `fee + dust` to the Treasury account.
   - `claim` is callable once per participant after `Finalized`.

## Consequences

- Reduces on-chain settlement transactions from `O(N * M)` (per milestone) to `O(N)` (once per participant at cohort end).
- Preserves the exact pure accounting logic and property-tested invariant in `lib/economics.ts`, replacing `ONE_USDC` (`1_000_000n`) with `LAMPORTS_PER_SOL` (`1_000_000_000n`) and `MAX_SETTLE_BOUNTY = 10_000_000n` (`0.01 SOL`).
