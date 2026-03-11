# PoolFans SDK — Claude Configuration

## Project Overview

- **Name:** @poolfans/sdk
- **Type:** TypeScript SDK for Clanker token deployment with tokenized fee rewards
- **Stack:** TypeScript 5.3, viem (peer dep), tsup (bundler), vitest (tests)
- **Chain:** Base Mainnet

## Architecture

```text
src/
├── index.ts                  # Main export
├── PoolFansTokenizer.ts      # SDK class (deploy, tokenization, rewards)
├── types.ts                  # Full type definitions
├── constants.ts              # Contract addresses, presets
└── v4/
    └── index.ts              # V4-specific re-exports
```

## Key APIs

- `deployWithTokenizedFees()` — All-in-one: deploy → vault → shares → optional vesting/dev buy
- `initTokenization()` / `finalizeTokenization()` — Add tokenization to existing tokens
- `claimRewards()` — Claim accrued fee rewards
- Query helpers — vault info, user positions

## Commands

```bash
npm run build         # tsup build (CJS + ESM + .d.ts)
npm run test          # vitest
npm run lint          # ESLint
```

## Key Contracts (Base)

- V4 Tokenizer: `0xea8127533f7be6d04b3dba8f0a496f2dcfd27728`
- V3.1.0 Tokenizer: `0x50e2a7193c4ad03221f4b4e3e33cdf1a46671ced`
- V4 Hook: `0xd60D6B218116cFd801E28F78d011a203D2b068Cc`

## Coding Conventions

- Fully typed, viem-native
- Dual exports: main (`/dist`) + v4 (`/dist/v4`)
- Async-aware result objects with `waitForTransaction()`
- Up to 7 reward recipients (BPS splits)
