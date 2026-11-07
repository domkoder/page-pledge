# PagePledge — Domain Glossary

- **Cohort** — A group of participants committing to the same learning goal under fixed rules. Rules are immutable once the first participant deposits.
- **Milestone** — A dated learning checkpoint within a cohort (e.g. "chapters 1–3 by Friday"). Has a deadline, a grace period and a **material hash**.
- **Material** — The source text supplied by the cohort creator for a milestone (pasted text, PDF or URL). The AI generates quiz questions from this text only. Its hash is stored on-chain with the milestone.
- **Pledge** — A participant's SOL deposit into the cohort vault.
- **Forfeiture** — The portion of a pledge lost when a participant has no completion for a milestone at `deadline + grace`. Deterministic; never decided by the oracle.
- **Reward pool** — Forfeited funds, distributable to participants who finished.
- **Oracle** — The single off-chain key that signs **completion attestations** after the AI grades a quiz. It can approve; it can never slash (ADR 0001).
- **Completion attestation** — An oracle-signed statement that participant X passed milestone M, verified on-chain.
- **Override** — A creator-signed completion used only when the oracle is silent (ADR 0002).
- **Settlement** — Permissionless on-chain instruction that applies forfeiture after `deadline + grace`.
- **Keeper** — An off-chain script that calls settlement. It has no special authority.
- **Vault** — Per-cohort PDA holding the pledged SOL.
- **Yield adapter** — Optional integration that deploys idle vault funds to a Solana lending protocol (ADR 0004).
- **Membership** — A wallet's participation in one cohort. A wallet can hold many memberships at once (ADR 0009).
