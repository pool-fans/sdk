# @poolfans/sdk

TypeScript SDK for deploying Clanker tokens with tokenized fee rewards via PoolFans.

## Features

- 🚀 **Deploy tokens with tokenized fees** - One-click deployment with automatic revenue share tokenization
- 💰 **Configurable reward distribution** - Up to 7 recipients with custom splits
- 🔄 **Two-step tokenization** - Convert existing Clanker tokens to tokenized fee model
- ⚡ **Dynamic fee support** - MEV protection with decaying fees
- 🏦 **Vesting vault integration** - Lock tokens with cliff/linear vesting
- 🎯 **Custom LP positions** - Configure concentrated liquidity ranges

## Installation

```bash
npm install @poolfans/sdk viem
# or
yarn add @poolfans/sdk viem
# or
pnpm add @poolfans/sdk viem
# or
bun add @poolfans/sdk viem
```

## Quick Start

```typescript
import { PoolFansTokenizer, POOL_POSITIONS, FEE_CONFIGS } from '@poolfans/sdk'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// Setup clients
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
})

// Initialize SDK
const tokenizer = new PoolFansTokenizer({
  publicClient,
  walletClient,
})

// Deploy new token with tokenized fees
const result = await tokenizer.deployWithTokenizedFees({
  name: "My Token",
  symbol: "MTK",
  image: "ipfs://your-image-hash",
  tokenAdmin: account.address,

  // Revenue share recipients
  rewards: {
    recipients: [
      {
        recipient: account.address,
        admin: account.address,
        bps: 6000,  // 60%
        token: "Both",
      },
      {
        recipient: "0x...",  // Treasury
        admin: "0x...",
        bps: 4000,  // 40%
        token: "Both",
      },
    ],
  },

  // Dynamic fees with MEV protection
  fees: FEE_CONFIGS.DynamicBasic,

  // Standard 5-position LP
  pool: {
    positions: POOL_POSITIONS.Standard,
  },

  // Optional vesting vault
  vault: {
    percentage: 20,
    lockupDuration: 604800,   // 7 days
    vestingDuration: 2592000, // 30 days
  },

  // Optional dev buy
  devBuy: {
    ethAmount: 0.1,
  },
})

const { tokenAddress, vaultAddress, sharesToken } = await result.waitForTransaction()
console.log('Token:', tokenAddress)
console.log('Revenue Vault:', vaultAddress)
console.log('Share Token:', sharesToken)
```

## Tokenize Existing Clanker

```typescript
// Step 1: Initialize tokenization
const initResult = await tokenizer.initTokenization({
  clankerToken: "0x...",
  version: "v4",
  rewards: {
    recipients: [{
      recipient: account.address,
      admin: account.address,
      bps: 10000,
      token: "Both",
    }],
  },
})

const { vaultAddress, pendingId } = await initResult.waitForTransaction()
console.log('Vault deployed at:', vaultAddress)

// Step 2: Transfer fee admin to vault via clanker.world Fee Locker

// Step 3: Finalize tokenization
const finalizeResult = await tokenizer.finalizeTokenization({
  pendingId,
  clankerToken: "0x...",
})

const { sharesToken } = await finalizeResult.waitForTransaction()
console.log('Revenue shares minted:', sharesToken)
```

## Claim Rewards

```typescript
// Claim accumulated rewards
const claimResult = await tokenizer.claimRewards({
  vaultAddress: "0x...",
})

await claimResult.waitForTransaction()
console.log('Rewards claimed!')

// Check pending rewards
const position = await tokenizer.getUserPosition(vaultAddress, account.address)
console.log('Claimable:', position.claimableClanker, position.claimablePaired)
```

## Configuration Presets

### Pool Positions

```typescript
import { POOL_POSITIONS } from '@poolfans/sdk'

// Standard 5-position (meme tokens)
POOL_POSITIONS.Standard

// Project setup (higher liquidity concentration)
POOL_POSITIONS.Project

// Legacy full-range (V2 style)
POOL_POSITIONS.Legacy
```

### Fee Configs

```typescript
import { FEE_CONFIGS } from '@poolfans/sdk'

// Dynamic with 1-hour decay (recommended)
FEE_CONFIGS.DynamicBasic

// Dynamic with 24-hour decay
FEE_CONFIGS.DynamicSlow

// Static 1% fee
FEE_CONFIGS.Static1Percent

// Static 0.3% fee
FEE_CONFIGS.Static03Percent
```

### Vault Presets

```typescript
import { VAULT_PRESETS } from '@poolfans/sdk'

// 7-day cliff, 20% supply
VAULT_PRESETS.ShortLock

// 30-day lock + 90-day vest, 30% supply
VAULT_PRESETS.MediumVest

// 90-day lock + 180-day vest, 50% supply
VAULT_PRESETS.LongVest
```

## Contract Addresses (Base)

| Contract | Address |
|----------|---------|
| V4 Tokenizer | `0xea8127533f7be6d04b3dba8f0a496f2dcfd27728` |
| V3.1.0 Tokenizer | `0x50e2a7193c4ad03221f4b4e3e33cdf1a46671ced` |
| WETH | `0x4200000000000000000000000000000000000006` |

## API Reference

### PoolFansTokenizer

#### `deployWithTokenizedFees(options)`

Deploy a new Clanker V4 token with tokenized fee rewards.

#### `initTokenization(options)`

Initialize tokenization for an existing Clanker token (step 1 of 2).

#### `finalizeTokenization(options)`

Complete tokenization after admin transfer (step 2 of 2).

#### `claimRewards(options)`

Claim accumulated rewards from a vault.

#### `getVaultInfo(vaultAddress)`

Get vault information including token addresses and pending rewards.

#### `getUserPosition(vaultAddress, userAddress)`

Get a user's share balance and claimable rewards.

## Links

- [Documentation](https://pool.fans/docs#sdk)
- [GitHub](https://github.com/pool-fans/sdk)
- [Contracts](https://github.com/pool-fans/bonding-auction-market)
- [Clanker SDK Reference](https://clanker.gitbook.io/clanker-documentation/sdk/v4.0.0)

## License

MIT
