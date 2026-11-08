# 0009 — A wallet can belong to many cohorts

**Status:** accepted

## Decisions

- No on-chain cap on concurrent cohorts per wallet. The UI warns with total SOL committed across cohorts and overlapping deadlines.
- All state is keyed per cohort: pledge `(cohort, wallet)`, completion `(cohort, milestone, wallet)`. Each cohort has its own vault; one failure never touches another cohort's funds.
- Quiz attempts and sessions are tracked oracle-side per `(cohort, milestone, wallet)`. Timers are independent.
- The dashboard lists all of a wallet's cohorts with a combined "upcoming deadlines" view.
- Cohort-local only: the trust score is per cohort; no cross-cohort reputation in the MVP (later: a profile PDA).
- The keeper scans cohort accounts (state + deadline filters), not wallets. `settle` is per `(cohort, milestone, wallet)`, batched if needed.

## Consequences

- The attestation (ADR 0005) must always bind cohort + milestone + wallet to prevent cross-cohort replay.
- Over-commitment is a user risk surfaced by the UI, not prevented.
