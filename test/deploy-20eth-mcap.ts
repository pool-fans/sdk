/**
 * Deploy Test Token with 20 ETH Starting Market Cap
 *
 * Deploys a Clanker token on Base Mainnet with ~20 ETH market cap.
 *
 * Market cap calculation:
 * - Total supply: 100B tokens (100,000,000,000)
 * - Target market cap: 20 ETH
 * - Price per token: 20 ETH / 100B = 0.0000000002 ETH
 *
 * Tick calculation for Uniswap V4:
 * - Price = 1.0001^tick (when token0 is the clanker)
 * - For very low prices, we use negative ticks
 * - tick = log(price) / log(1.0001)
 *
 * Usage:
 *   cd packages/sdk
 *   BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY" PRIVATE_KEY=0x... npx tsx test/deploy-20eth-mcap.ts
 */

import { createWalletClient, createPublicClient, http, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { PoolFansTokenizer, POOL_POSITIONS } from '../src'
import type { PoolPosition } from '../src/types'

// ============================================
// Configuration
// ============================================

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`
const RPC_URL = process.env.BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/GMcF3VVQXJXTG3KRY0isu'

// ============================================
// Token Configuration
// ============================================

const TOKEN_CONFIG = {
  name: 'Twenty ETH Test 2',
  symbol: 'TEST20B',
  image: '',

  // 100% to deployer
  rewardSplit: [
    { percentage: 100 },
  ],

  // Use static fees for simplicity
  feeType: 'static' as const,

  // Standard pool positions
  poolPreset: 'Standard' as keyof typeof POOL_POSITIONS,

  // No dev buy - just launch with liquidity
  devBuyEth: 0,
}

/**
 * Calculate the tick for a target market cap
 *
 * For Clanker V4:
 * - Token supply is 100B (100,000,000,000 with 18 decimals)
 * - Price per token = marketCapEth / 100,000,000,000
 * - Tick = log(price) / log(sqrt(1.0001))
 *
 * For very small prices (low market cap), we need negative ticks.
 * The formula: tick = ln(price) / ln(1.0001)
 *
 * For 20 ETH market cap:
 * - Price = 20 / 100B = 2e-10 ETH per token
 * - tick = ln(2e-10) / ln(1.0001) ≈ -223,000
 *
 * Standard Clanker launches use tick -230400 which is roughly 30-40 ETH mcap
 * For 20 ETH, we need a slightly more negative tick (lower price)
 */
function calculateTickForMarketCap(marketCapEth: number): number {
  const totalSupply = 100_000_000_000 // 100B tokens
  const pricePerToken = marketCapEth / totalSupply

  // tick = ln(price) / ln(1.0001)
  const tick = Math.log(pricePerToken) / Math.log(1.0001)

  // Round to nearest 200 (tick spacing)
  return Math.round(tick / 200) * 200
}

async function main() {
  console.log('🚀 PoolFans SDK - 20 ETH Market Cap Deployment\n')

  // Validate private key
  if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith('0x')) {
    console.error('❌ Error: PRIVATE_KEY environment variable required')
    console.log('\nUsage:')
    console.log('  BASE_RPC_URL="..." PRIVATE_KEY=0x... npx tsx test/deploy-20eth-mcap.ts')
    process.exit(1)
  }

  // Calculate tick for 20 ETH market cap
  const targetMarketCapEth = 20
  const calculatedTick = calculateTickForMarketCap(targetMarketCapEth)

  console.log(`📊 Market Cap Calculation:`)
  console.log(`   Target: ${targetMarketCapEth} ETH`)
  console.log(`   Calculated tick: ${calculatedTick}`)
  console.log(`   (Standard Clanker tick is -230400 for ~30-40 ETH mcap)\n`)

  // Setup
  const account = privateKeyToAccount(PRIVATE_KEY)

  console.log(`📡 Network: Base Mainnet (8453)`)
  console.log(`👛 Wallet: ${account.address}`)

  // Create clients
  const transport = http(RPC_URL)

  const publicClient = createPublicClient({
    chain: base,
    transport,
  })

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport,
  })

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`💰 Balance: ${formatEther(balance)} ETH`)

  if (balance === 0n) {
    console.error('\n❌ Error: Wallet has no ETH for gas')
    process.exit(1)
  }

  console.log('\n⚠️  WARNING: You are deploying to MAINNET!')
  console.log('This will cost real ETH. Press Ctrl+C to cancel.')
  console.log('Waiting 5 seconds...\n')
  await new Promise(r => setTimeout(r, 5000))

  // Initialize SDK
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenizer = new PoolFansTokenizer({
    publicClient: publicClient as any,
    walletClient: walletClient as any,
  })

  // Build recipients array
  const recipients = TOKEN_CONFIG.rewardSplit.map((r) => {
    const bps = r.percentage * 100
    return {
      recipient: account.address,
      admin: account.address,
      bps,
      token: 'Both' as const,
    }
  })

  // Custom positions for 20 ETH market cap
  // The tick must be <= the lowest tickLower, so we adjust positions to start at -223400
  const targetTick = -223400 // ~20 ETH market cap

  // Custom positions shifted to work with higher starting tick
  const positions: PoolPosition[] = [
    { tickLower: -223400, tickUpper: -207000, positionBps: 1000 },  // 10% - Near price
    { tickLower: -207000, tickUpper: -148000, positionBps: 5000 },  // 50% - Core liquidity
    { tickLower: -195000, tickUpper: -148000, positionBps: 1500 },  // 15% - Mid range
    { tickLower: -148000, tickUpper: -113000, positionBps: 2000 },  // 20% - Extended range
    { tickLower: -134000, tickUpper: -113000, positionBps: 500 },   // 5% - Far range
  ]

  const deployOptions: Parameters<typeof tokenizer.deployWithTokenizedFees>[0] = {
    name: TOKEN_CONFIG.name,
    symbol: TOKEN_CONFIG.symbol,
    image: TOKEN_CONFIG.image,
    tokenAdmin: account.address,
    rewards: { recipients },
    pool: {
      positions,
      tickIfToken0IsClanker: targetTick,
    },
    context: {
      interface: 'PoolFans SDK',
      platform: 'cli',
    },
  }

  // Display config
  console.log('📋 Token Configuration:')
  console.log(`   Name: ${TOKEN_CONFIG.name}`)
  console.log(`   Symbol: ${TOKEN_CONFIG.symbol}`)
  console.log(`   Starting Tick: ${targetTick} (~20 ETH market cap)`)
  console.log(`   Recipients: ${recipients.length}`)

  console.log('\n📤 Sending deployment transaction...')

  // Deploy!
  const result = await tokenizer.deployWithTokenizedFees(deployOptions)

  if (result.error) {
    console.error(`\n❌ Deployment failed: ${result.error.message}`)
    process.exit(1)
  }

  console.log(`✅ Transaction sent: ${result.txHash}`)
  console.log(`🔗 Explorer: https://basescan.org/tx/${result.txHash}`)

  console.log('\n⏳ Waiting for confirmation...')

  try {
    const data = await result.waitForTransaction()

    console.log('\n✅ Deployment successful!\n')
    console.log('📍 Addresses:')
    console.log(`   Token: ${data.tokenAddress}`)
    console.log(`   Revenue Vault: ${data.vaultAddress}`)
    console.log(`   Shares Token: ${data.sharesToken}`)

    if (data.tokenAddress === '0x0000000000000000000000000000000000000000') {
      console.log('\n⚠️  Note: Check the transaction on BaseScan for actual deployed addresses.')
    }

  } catch (err) {
    console.error(`\n❌ Transaction failed: ${(err as Error).message}`)
    console.log('Check the transaction on BaseScan for details.')
    process.exit(1)
  }
}

main().catch(console.error)
