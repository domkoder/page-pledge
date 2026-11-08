# 0006 — Payout rule

**Status:** superseded by ADR 0013 (`p1.md` / `lib/economics.ts` proportional forfeiture, 200 bps protocol fee, 100 bps keeper bounty capped at 0.01 SOL, and end-of-cohort `settle_user` -> `finalize` -> `claim`)

## Decision
- Per missed milestone, forfeiture = `pledge * forfeit_bps / milestone_count`, taken once per milestone at `deadline + grace`.
- Forfeitures accumulate in the reward pool.
- Everyone gets back their pledge minus forfeitures.
- Participants who completed ALL milestones split the pool equally.
- Rounding dust goes to the last claimer.
- Invariant: sum of all payouts == vault balance. Nobody profits unless someone else failed.

## Edge cases to specify before coding
- Nobody finishes: pool returned pro rata by remaining balance (ADR 0007).
- Participants who left or never deposited.
