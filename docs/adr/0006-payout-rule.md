# 0006 — Payout rule

**Status:** accepted

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
