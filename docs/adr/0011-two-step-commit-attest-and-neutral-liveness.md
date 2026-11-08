# 0011 — Two-step submission (`commit_submission` + `complete_milestone`), deterministic `NEUTRAL` oracle-liveness fallback, and permissionless-participant `start_cohort`

**Status:** accepted (supersedes ADR 0002; amends ADR 0005 and ADR 0007)

## Context
In ADR 0001 and ADR 0002, oracle outages were mitigated via a constrained `creator_override` instruction (`creator != participant` after $N$ hours of oracle silence), while ADR 0005/0007 described a single-step `complete_milestone` transaction and a fixed `join_deadline` timer. Meanwhile, `p1.md` and `MockChain` introduced a two-step on-chain flow (`commit_submission` before `deadline[i]`, followed by `complete_milestone` before `deadline[i] + grace`), a zero-trust `NEUTRAL` outcome for ungraded commits, and an explicit `start_cohort` transition once $\ge 2$ participants join.

However, a naive on-chain `NEUTRAL` rule that treated *any* uncompleted `commit_submission` as `NEUTRAL` would let a participant avoid forfeiture by committing a garbage hash before `deadline[i]` and simply never submitting `complete_milestone`. Conversely, letting the oracle submit a "failed grade" transaction on-chain would violate ADR 0001 ("Oracle can approve, never slash").

## Decision
1. **Two-Step On-Chain Milestone Lifecycle (`commit_submission` + `complete_milestone`):**
   - **Commit (`commit_submission`):** Allowed while `now <= deadline[i]` and milestone `i` is not completed, up to `MAX_COMMIT_ATTEMPTS = 3` per milestone. Stores the participant's latest `answer_hash`, `commit_timestamp = now`, and increments `attempt_count`.
   - **Complete (`complete_milestone`):** Allowed while `commit_timestamp <= deadline[i]` and `now <= deadline[i] + grace`. Verifies the oracle's Ed25519 signature (via the `Ed25519SigVerify111111111111111111111111111` precompile instruction sysvar) over the canonical payload `"PAGEPLEDGE_ATT_V1" || programId || clusterId || cohort || cohortEpoch || user || milestoneIdx || score || commitHash || expiresAt` matching the participant's latest `answer_hash` and `score >= pass_threshold`. Sets bit `i` in `completed_bitmap` and updates `cohort.last_oracle_ts = now`.
2. **Deterministic `NEUTRAL` Liveness Fallback (Superseding ADR 0002 Creator Override):**
   - At `settle_user` (after the final milestone's `deadline + grace`), each milestone `i` where `completed_bitmap` bit `i == 1` is **`PASSED`**.
   - If bit `i == 0` and the participant has no on-time commit (`attempt_count == 0` or `commit_timestamp > deadline[i]`), the milestone is **`MISSED`**.
   - If bit `i == 0` and the participant committed on time (`commit_timestamp <= deadline[i]`), the milestone resolves to **`NEUTRAL`** (no forfeiture for milestone `i`, but participant is ineligible for the reward pool) if and only if the oracle showed **zero cohort activity** between `commit_timestamp` and `deadline[i] + grace` (`cohort.last_oracle_ts < commit_timestamp`, and no off-chain failed grade in `MockChain`). Otherwise it resolves to **`MISSED`**.
   - The oracle still only ever signs passing attestations (never slashes), participants cannot game `NEUTRAL` when the oracle is live, and no `creator_override` instruction or creator trust is required.
3. **Cohort Start Trigger (`start_cohort`):**
   - Cohorts are created in `Open` status and transition to `Active` via `start_cohort` once `participant_count >= 2` (`min_participants`), re-anchoring `deadlines[i]` from `started_at`.
   - Either the cohort `creator` or any joined `participant` may call `start_cohort` once `>= 2` participants have joined, ensuring live demos never block on switching wallets or waiting for a `join_deadline` timer.

## Consequences
- Cuts `creator_override` and `refund` instructions from the Anchor program while preserving both ADR 0001's non-slashing oracle guarantee and zero-trust outage protection.
- Requires `last_oracle_ts: i64` on the `Cohort` PDA and per-milestone `(answer_hash, commit_timestamp, attempt_count)` fields on the `Participant` (`Membership`) PDA.
