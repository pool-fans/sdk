/**
 * Test Token Deployment Script
 *
 * Deploys a token on Base Mainnet using the PoolFans SDK.
 *
 * Prerequisites:
 * 1. Have ETH on Base Mainnet for gas
 * 2. Set your private key in environment variable
 *
 * Usage:
 *   cd packages/sdk
 *   PRIVATE_KEY=0x... npx ts-node test/deploy-test-token.ts
 */

import { createWalletClient, createPublicClient, http, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'
import { PoolFansTokenizer, POOL_POSITIONS, FEE_CONFIGS } from '../src'
import type { PoolPosition } from '../src/types'

// ============================================
// Configuration
// ============================================

// Set to 'mainnet' for real deployment, 'testnet' for testing
const NETWORK: 'mainnet' | 'testnet' = 'mainnet'

// Your private key (use testnet wallet for testing!)
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`

// RPC URLs - The public Base RPC doesn't support eth_sendTransaction
// You need a private RPC from Alchemy, Infura, QuickNode, etc.
// Get a free one at: https://www.alchemy.com/chain-connect/chain/base
const RPC_URLS = {
  mainnet: process.env.BASE_RPC_URL || process.env.BASE_RPC || 'https://base-mainnet.g.alchemy.com/v2/GMcF3VVQXJXTG3KRY0isu',
  testnet: process.env.base_sepolia_rpc_url || 'https://base-sepolia.g.alchemy.com/v2/demo',
}

// ============================================
// Token Configuration - CUSTOMIZE THIS
// ============================================

const TOKEN_CONFIG = {
  // Basic token info
  name: 'My Test Token',
  symbol: 'MTT',
  image: 'https://cdn.dexscreener.com/cms/images/890326e371b23e3b1f6f6e3411a0c5487d246aa10b15811611b01cdfa28a447a?width=64&height=64&fit=crop&quality=95&format=auto', // Optional: IPFS or HTTP URL to token image

  // Your wallet will be the admin
  // Recipients get revenue share tokens
  rewardSplit: [
    { percentage: 100 }, // 100% to deployer
    // Add more recipients like:
    // { address: '0x...', percentage: 30 },
    // { address: '0x...', percentage: 20 },
  ],

  // Fee type: 'dynamic' (MEV protection) or 'static'
  // Try 'static' if 'dynamic' causes issues
  feeType: 'static' as 'dynamic' | 'static',

  // Pool position preset: 'Standard', 'Project', or 'Legacy'
  poolPreset: 'Standard' as keyof typeof POOL_POSITIONS,

  // Optional: Dev buy amount in ETH (set to 0 for no dev buy)
  devBuyEth: 0,

  // Optional: Vesting vault (set to null for no vesting)
  vesting: null as null | {
    percentage: number      // % of supply to lock (10-90)
    lockupDays: number      // cliff period in days
    vestingDays: number     // vesting duration in days
  },
}

// ============================================
// Script Logic
// ============================================

async function main() {
  console.log('🚀 PoolFans SDK Deployment\n')

  // Validate private key
  if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith('0x')) {
    console.error('❌ Error: PRIVATE_KEY environment variable required')
    console.log('\nUsage:')
    console.log('  PRIVATE_KEY=0x... npx ts-node test/deploy-test-token.ts')
    process.exit(1)
  }

  // Setup
  const chain = NETWORK === 'mainnet' ? base : baseSepolia
  const rpcUrl = RPC_URLS[NETWORK]
  const account = privateKeyToAccount(PRIVATE_KEY)

  console.log(`📡 Network: ${chain.name} (${chain.id})`)
  console.log(`👛 Wallet: ${account.address}`)

  // Create clients
  // Use custom RPC if provided, otherwise use default chain RPC
  const transport = rpcUrl.includes('demo') ? http() : http(rpcUrl)

  const publicClient = createPublicClient({
    chain,
    transport,
  })

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  })

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`💰 Balance: ${formatEther(balance)} ETH`)

  if (balance === 0n) {
    console.error('\n❌ Error: Wallet has no ETH for gas')
    process.exit(1)
  }

  // Warn if mainnet
  if (NETWORK === 'mainnet') {
    console.log('\n⚠️  WARNING: You are deploying to MAINNET!')
    console.log('This will cost real ETH. Press Ctrl+C to cancel.')
    console.log('Waiting 10 seconds...\n')
    await new Promise(r => setTimeout(r, 10000))
  }

  // Initialize SDK
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenizer = new PoolFansTokenizer({
    publicClient: publicClient as any,
    walletClient: walletClient as any,
  })

  // Build recipients array
  const recipients = TOKEN_CONFIG.rewardSplit.map((r) => {
    const address = 'address' in r ? (r as { address: string }).address : account.address
    const bps = r.percentage * 100 // Convert percentage to basis points

    return {
      recipient: address as `0x${string}`,
      admin: address as `0x${string}`,
      bps,
      token: 'Both' as const,
    }
  })

  // Validate bps
  const totalBps = recipients.reduce((sum, r) => sum + r.bps, 0)
  if (totalBps !== 10000) {
    console.error(`\n❌ Error: Reward percentages must sum to 100% (got ${totalBps / 100}%)`)
    process.exit(1)
  }

  // Get positions as mutable array
  const positions: PoolPosition[] = [...POOL_POSITIONS[TOKEN_CONFIG.poolPreset]]

  // Build deployment options
  const deployOptions: Parameters<typeof tokenizer.deployWithTokenizedFees>[0] = {
    name: TOKEN_CONFIG.name,
    symbol: TOKEN_CONFIG.symbol,
    image: TOKEN_CONFIG.image,
    tokenAdmin: account.address,
    rewards: { recipients },
    fees: TOKEN_CONFIG.feeType === 'dynamic'
      ? FEE_CONFIGS.DynamicBasic
      : FEE_CONFIGS.Static1Percent,
    pool: {
      positions,
    },
    context: {
      interface: 'PoolFans SDK',
      platform: 'cli',
    },
  }

  // Add dev buy if specified
  if (TOKEN_CONFIG.devBuyEth > 0) {
    deployOptions.devBuy = {
      ethAmount: TOKEN_CONFIG.devBuyEth,
    }
  }

  // Add vesting if specified
  if (TOKEN_CONFIG.vesting) {
    deployOptions.vault = {
      percentage: TOKEN_CONFIG.vesting.percentage,
      lockupDuration: TOKEN_CONFIG.vesting.lockupDays * 24 * 60 * 60,
      vestingDuration: TOKEN_CONFIG.vesting.vestingDays * 24 * 60 * 60,
      recipient: account.address,
    }
  }

  // Display config
  console.log('\n📋 Token Configuration:')
  console.log(`   Name: ${TOKEN_CONFIG.name}`)
  console.log(`   Symbol: ${TOKEN_CONFIG.symbol}`)
  console.log(`   Fee Type: ${TOKEN_CONFIG.feeType}`)
  console.log(`   Pool Preset: ${TOKEN_CONFIG.poolPreset}`)
  console.log(`   Recipients: ${recipients.length}`)
  recipients.forEach((r, idx) => {
    console.log(`     ${idx + 1}. ${r.recipient.slice(0, 10)}... (${r.bps / 100}%)`)
  })
  if (TOKEN_CONFIG.devBuyEth > 0) {
    console.log(`   Dev Buy: ${TOKEN_CONFIG.devBuyEth} ETH`)
  }
  if (TOKEN_CONFIG.vesting) {
    console.log(`   Vesting: ${TOKEN_CONFIG.vesting.percentage}% locked for ${TOKEN_CONFIG.vesting.lockupDays}d + ${TOKEN_CONFIG.vesting.vestingDays}d vest`)
  }

  console.log('\n📤 Sending deployment transaction...')

  // Deploy!
  const result = await tokenizer.deployWithTokenizedFees(deployOptions)

  if (result.error) {
    console.error(`\n❌ Deployment failed: ${result.error.message}`)
    process.exit(1)
  }

  console.log(`✅ Transaction sent: ${result.txHash}`)

  // Show explorer link
  const explorerUrl = NETWORK === 'mainnet'
    ? `https://basescan.org/tx/${result.txHash}`
    : `https://sepolia.basescan.org/tx/${result.txHash}`
  console.log(`🔗 Explorer: ${explorerUrl}`)

  console.log('\n⏳ Waiting for confirmation...')

  try {
    const data = await result.waitForTransaction()

    console.log('\n✅ Deployment successful!\n')
    console.log('📍 Addresses:')
    console.log(`   Token: ${data.tokenAddress}`)
    console.log(`   Revenue Vault: ${data.vaultAddress}`)
    console.log(`   Shares Token: ${data.sharesToken}`)

    // Note about placeholder addresses
    if (data.tokenAddress === '0x0000000000000000000000000000000000000000') {
      console.log('\n⚠️  Note: Addresses shown as 0x0... need to be parsed from transaction logs.')
      console.log('   Check the transaction on the explorer to see the actual deployed addresses.')
    }

  } catch (err) {
    console.error(`\n❌ Transaction failed: ${(err as Error).message}`)
    console.log('Check the transaction on the explorer for details.')
    process.exit(1)
  }
}

main().catch(console.error)
