# Anchor Vault Program

This template includes a simple SOL vault program built with [Anchor](https://www.anchor-lang.com/).

## Pre-deployed Program (Devnet)

The PagePledge vault program is deployed and verified on **devnet**:

- **Program ID:** [`Dtp24PjyLpJ9Gr5TuMREoRkyRunknUjT9UW1HmiAAp3t`](https://explorer.solana.com/address/Dtp24PjyLpJ9Gr5TuMREoRkyRunknUjT9UW1HmiAAp3t?cluster=devnet)
- **ProgramData Address:** [`DLYUX197AmBGQpGd6vvguy679y1kqpE2Bm52ru4HCKkA`](https://explorer.solana.com/address/DLYUX197AmBGQpGd6vvguy679y1kqpE2Bm52ru4HCKkA?cluster=devnet)
- **IDL Metadata Account:** [`DDZvsLb7H4Q93LasKQPXstKFPfqjotgAnEtPzaDtqQnH`](https://explorer.solana.com/address/DDZvsLb7H4Q93LasKQPXstKFPfqjotgAnEtPzaDtqQnH?cluster=devnet)
- **Upgrade Authority:** [`4kDSX6pUkSMDXgKLMFVm1itSFfVDDcMQCSUb7cXsEFjP`](https://explorer.solana.com/address/4kDSX6pUkSMDXgKLMFVm1itSFfVDDcMQCSUb7cXsEFjP?cluster=devnet)
- **Cluster:** Devnet (`https://api.devnet.solana.com`)

You can inspect the program on Solana Explorer or fetch the IDL:

```bash
anchor idl fetch Dtp24PjyLpJ9Gr5TuMREoRkyRunknUjT9UW1HmiAAp3t --provider.cluster devnet
```

## Deploying Your Own Program

To deploy your own version of the program:

### 1. Generate a new program keypair

```bash
cd anchor
solana-keygen new -o target/deploy/vault-keypair.json
```

### 2. Get the new program ID

```bash
solana address -k target/deploy/vault-keypair.json
```

### 3. Update the program ID

Update the program ID in these files:

- `anchor/Anchor.toml` - Update `vault = "..."` under `[programs.devnet]`
- `anchor/programs/vault/src/lib.rs` - Update `declare_id!("...")`

### 4. Build and deploy

```bash
# Build the program
anchor build

# Get devnet SOL for deployment (~2 SOL needed)
solana airdrop 2 --url devnet

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### 5. Regenerate the TypeScript client

```bash
cd ..
npm run codama:js
```

This updates the generated client code in `app/generated/vault/` with your new program ID.

## Program Overview

The vault program allows users to:

- **Deposit**: Send SOL to a personal vault PDA (Program Derived Address)
- **Withdraw**: Retrieve all SOL from your vault

Each user gets their own vault derived from their wallet address.

## Testing

Run the Anchor tests:

```bash
anchor test --skip-deploy
```
