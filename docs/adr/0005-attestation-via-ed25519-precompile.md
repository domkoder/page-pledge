# 0005 — Attestations are verified via the Ed25519 precompile

**Status:** accepted

## Decision

- After a passing quiz the oracle backend signs `{cohort, milestone, wallet, nonce, expiry}` with ed25519.
- The participant submits it in a transaction that includes an Ed25519 precompile instruction.
- The program reads the instructions sysvar, checks the oracle pubkey and the message fields, then records completion.
- Nonce/expiry plus the (cohort, milestone, wallet) PDA prevent replay.

## Consequences

- The oracle never pays fees or signs transactions; the participant does.
- The oracle key can only approve (ADR 0001).
