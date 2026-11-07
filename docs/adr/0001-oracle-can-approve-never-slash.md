# 0001 — Oracle can approve but never slash

**Status:** accepted

## Context
AI grading is subjective and not provable on-chain. Letting an oracle decide that someone *failed* would give one key the power to move user funds.

## Decision
- A single oracle key signs completion attestations only.
- Forfeiture is triggered solely by a missing attestation at `deadline + grace` (deterministic, permissionless settlement).
- A failed quiz does nothing financially; users can retry until the deadline.
- The cohort creator can sign a manual override completion if the oracle is down or wrong.

## Consequences
- A malicious/buggy oracle can refuse to approve (mitigated by override) or approve cheaters — it cannot steal funds.
- LLM-assisted cheating is a residual risk, mitigated by ADR 0008.
- Strategy: target Top 3 Overall + AI Track; AI and Solana each do real work.
