# 0010 — Unify pledge asset and vault accounting around Native SOL lamports

**Status:** accepted

## Context
The original domain glossary (`CONTEXT.md`), `idea.md`, and `anchor/programs/vault/src/lib.rs` specify native SOL deposits (`SystemProgram::transfer`), whereas the UI prototype specification (`p1.md`), `lib/economics.ts`, and `MockChain` were initially written using 6-decimal micro-USDC (`1_000_000n`). Supporting SPL USDC on Devnet would require deploying a custom mock SPL mint, faucet instructions, and Associated Token Accounts (ATAs) for every participant, vault, and treasury account. Furthermore, Devnet SOL faucets cap airdrops at 1–2 SOL per request, making 100+ unit stakes impractical if mapped unscaled to SOL.

## Decision
- **Native SOL (9-decimal lamports) everywhere:** All monetary values across the Anchor program (`anchor/programs/vault/src/lib.rs`), `ChainClient` (`MockChain` and `SolanaChain`), and `lib/economics.ts` are denominated in integer **lamports** (`BigInt`, where `1 SOL = 1_000_000_000n` lamports). No USDC or 6-decimal token units remain in the protocol or UI.
- **UI conversion via Solana kit:** All internal calculations happen strictly in integer `lamports` (`BigInt`), with conversion between `SOL` and `lamports` performed only at the UI / intent-parsing boundary (`@solana/kit` `lamports()` / `1_000_000_000n` per SOL).
- **Devnet-friendly SOL stake parameters:**
  - Allowed cohort stake range in `/api/intent`: **`0.05 SOL` to `10 SOL`** (`50_000_000n` to `10_000_000_000n` lamports).
  - Default UI preset stakes: **`0.1 SOL`**, **`0.5 SOL`**, and **`1.0 SOL`**.
  - `MockChain` persona starting balances: **`10 SOL`** (`10_000_000_000n` lamports) each.
- **Separate 0-byte `SystemAccount` Vault PDA with creator-funded rent minimum:**
  - Each cohort has a dedicated 0-byte `SystemAccount<'info>` Vault PDA at seeds `[b"vault", cohort.key().as_ref()]`, distinct from the `Cohort` state account PDA.
  - During `create_cohort`, the creator transfers `Rent::get()?.minimum_balance(0)` (~`890,880` lamports) into the Vault PDA.
  - Pledged assets are defined as `A = vault.lamports() - rent_exempt_min`, guaranteeing the solvency invariant (`sum(payouts) + fee + dust == A`) holds to the exact lamport without ever dropping the Vault PDA into a non-rent-exempt state mid-claims.

## Consequences
- Eliminates all `anchor_spl::token` and ATA boilerplate from the Anchor program and client transactions; any Devnet wallet funded via standard SOL airdrop can immediately create or join a cohort.
- `p1.md` references to `USDC` / `stakeUsdc` / `usdcBalance` / `ONE_USDC` are superseded by `SOL` / `stakeSol` / `lamportsBalance` / `LAMPORTS_PER_SOL` (`1_000_000_000n`).
