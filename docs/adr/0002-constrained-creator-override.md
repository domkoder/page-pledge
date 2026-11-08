# 0002 — Creator override is constrained

**Status:** superseded by ADR 0011 (deterministic `NEUTRAL` outcome via on-chain `commit_submission` and cohort-level oracle liveness tracking)

## Context

0001 lets the cohort creator sign a manual override completion. Unconstrained, a creator could approve their own wallets, or collude with friends, to collect the reward pool.

## Decision

- The creator can override only for other wallets, never their own.
- An override is only valid after the oracle has been silent (no attestation for the cohort) for N hours (oracle-liveness gate).
- Every override emits a public on-chain event.

## Consequences

- The creator can't mint themselves a reward, but can still approve friends during an oracle outage. This is accepted for the MVP and visible on-chain.
- Sybil wallets joined by the creator remain an open risk (see open questions).

## Note (sybils)

Sybil-resistance is by economics, not identity: a creator-set minimum pledge, and a public cohort "trust score" (unique wallets, creator pledge). "Excluding the creator's linked wallets" cannot be enforced on-chain; it is a disclosure, not a guarantee. Cohorts are positioned as trust-among-friends.
