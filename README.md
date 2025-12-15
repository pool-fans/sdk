# @poolfans/sdk

[![npm version](https://img.shields.io/npm/v/@poolfans/sdk.svg)](https://www.npmjs.com/package/@poolfans/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeScript SDK for deploying Clanker tokens with tokenized fee rewards via PoolFans.

> **Production Ready** - Successfully tested on Base Mainnet. See [example transaction](https://basescan.org/tx/0x25440962eb164756dfb39c154d108029706336f1af57c4109af246a065ab912b).

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

## Custom Market Cap Deployment

By default, Clanker tokens launch at ~30-40 ETH market cap using tick `-230400`. You can customize the starting market cap by adjusting the `tickIfToken0IsClanker` parameter and providing custom pool positions.

### Understanding Ticks and Market Cap

The starting price (and thus market cap) is determined by the tick parameter:

```
Market Cap = Total Supply × Price per Token
Price = 1.0001^tick (for very small prices, tick is negative)
tick = ln(price) / ln(1.0001)
```

| Target Market Cap | Tick | Notes |
|-------------------|------|-------|
| ~40 ETH | -230400 | Standard Clanker default |
| ~20 ETH | -223400 | Lower starting price |
| ~10 ETH | -230400 | Standard (actual ~9.87 ETH) |

### Example: 20 ETH Market Cap

See [`test/deploy-20eth-mcap.ts`](./test/deploy-20eth-mcap.ts) for a complete working example.

**Key insight**: The `tickIfToken0IsClanker` must be ≤ the lowest `tickLower` in your positions. If you want a higher tick (lower market cap), you need custom positions.

```typescript
import { PoolFansTokenizer } from '@poolfans/sdk'
import type { PoolPosition } from '@poolfans/sdk'

// Custom positions for 20 ETH market cap
// The starting tick (-223400) must be <= lowest tickLower
const positions: PoolPosition[] = [
  { tickLower: -223400, tickUpper: -207000, positionBps: 1000 },  // 10% - Near price
  { tickLower: -207000, tickUpper: -148000, positionBps: 5000 },  // 50% - Core liquidity
  { tickLower: -195000, tickUpper: -148000, positionBps: 1500 },  // 15% - Mid range
  { tickLower: -148000, tickUpper: -113000, positionBps: 2000 },  // 20% - Extended range
  { tickLower: -134000, tickUpper: -113000, positionBps: 500 },   // 5% - Far range
]

const result = await tokenizer.deployWithTokenizedFees({
  name: "My Token",
  symbol: "MTK",
  image: "",
  tokenAdmin: account.address,
  rewards: {
    recipients: [{
      recipient: account.address,
      admin: account.address,
      bps: 10000,  // 100%
      token: "Both",
    }],
  },
  pool: {
    positions,
    tickIfToken0IsClanker: -223400,  // ~20 ETH market cap
  },
})

const { tokenAddress, vaultAddress } = await result.waitForTransaction()
```

**Verified deployment**: [0x840328aedc8b262aa26ff3fdad9fd4c3f2edfa48c88efb66bb14c8d24392cb6d](https://basescan.org/tx/0x840328aedc8b262aa26ff3fdad9fd4c3f2edfa48c88efb66bb14c8d24392cb6d)

### Tick Calculation Helper

```typescript
function calculateTickForMarketCap(marketCapEth: number): number {
  const totalSupply = 100_000_000_000 // 100B tokens
  const pricePerToken = marketCapEth / totalSupply

  // tick = ln(price) / ln(1.0001)
  const tick = Math.log(pricePerToken) / Math.log(1.0001)

  // Round to nearest 200 (tick spacing)
  return Math.round(tick / 200) * 200
}

// Examples:
calculateTickForMarketCap(20)  // Returns ~-223400
calculateTickForMarketCap(40)  // Returns ~-230400
```

## Configuration Presets

### Pool Positions

```typescript
import { POOL_POSITIONS } from '@poolfans/sdk'

// Standard 5-position setup (matches successful Clanker V4 deployments)
// tickLower: [-230400, -214000, -202000, -155000, -141000]
// tickUpper: [-214000, -155000, -155000, -120000, -120000]
// positionBps: [1000, 5000, 1500, 2000, 500] (10%, 50%, 15%, 20%, 5%)
POOL_POSITIONS.Standard

// Project setup - concentrated around launch price
POOL_POSITIONS.Project

// Simple 2-position setup
POOL_POSITIONS.Simple
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

## Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| V4 Tokenizer Factory | `0xea8127533f7be6d04b3dba8f0a496f2dcfd27728` |
| V3.1.0 Tokenizer | `0x50e2a7193c4ad03221f4b4e3e33cdf1a46671ced` |
| Clanker V4 Deployer | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` |
| Clanker V4 Hook | `0xd60D6B218116cFd801E28F78d011a203D2b068Cc` |
| Fee Locker | `0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496` |
| MEV Module | `0xebB25BB797D82CB78E1bc70406b13233c0854413` |
| WETH | `0x4200000000000000000000000000000000000006` |

## Contract Functions

### V4 Tokenizer Functions

| Function | Description |
|----------|-------------|
| `tokenizeAndDeployV4Clanker(config, shareRecipients)` | Deploy new token with tokenized fees |
| `finalizeTokenization(clankerToken, adminIndex)` | Complete tokenization after admin transfer |
| `deployVault(clankerToken, feePreference)` | Deploy a revenue vault |
| `computeVaultAddress(clankerToken, pairedToken, feePreference)` | Compute vault address |

### V3.1.0 Tokenizer Functions

| Function | Description |
|----------|-------------|
| `finalizeTokenization(clankerToken, adminIndex)` | Complete tokenization |
| `deployVault(clankerToken, feePreference)` | Deploy a revenue vault |
| `computeVaultAddress(clankerToken, pairedToken, feePreference)` | Compute vault address |
| `getTokenizerVersion()` | Get tokenizer version |
| `lpLocker()` | Get LP locker address |
| `rescueTokens(token, amount, recipient)` | Rescue tokens (admin) |
| `tokenizedParticipants(clankerToken)` | Get tokenized participants |

### Constants

| Constant | Description |
|----------|-------------|
| `BPS_DENOMINATOR` | Basis points denominator (10000) |
| `BPS_TO_PERCENTAGE` | Conversion factor |
| `SHARES_DECIMALS` | Decimals for share tokens |
| `LP_LOCKER_V3_1_0` | LP Locker contract address |
| `POSITION_MANAGER` | Position manager address |

### Events

| Event | Description |
|-------|-------------|
| `TokenizationFinalized` | Emitted when tokenization completes |
| `TokensRescued` | Emitted when tokens are rescued |

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
