# 0004 — Yield is optional and simulated on devnet

**Status:** accepted (amended by ADR 0014: second mock-lender Anchor program cut per cut-first rule; yield and lender-loss haircut simulated in `lib/economics.ts` / `MockChain`)

## Context
Real lending protocols (Kamino, Jupiter Lend, marginfi) have little or no devnet support. The core must work with no yield, and claims must never depend on a lending protocol being live.

## Decision
- The vault works with no yield; claims are paid from the vault, never gated on a lending call.
- A yield adapter is built last, after the core loop is demoable.
- On devnet the adapter targets a mock lending program we write, labelled clearly as a simulation.
- A reserve of withdrawable SOL is kept in the vault so claims can't be blocked by the adapter.

## Consequences
- The DeFi claim is a demonstrated integration shape, not real mainnet yield. Do not pitch it as real APY.
- Adds a second Anchor program (mock lender) to the scope; cut it first if time runs short.
