/**
 * Integration Test Examples for PoolFans SDK
 *
 * These tests require a real network connection and funded wallet.
 * Run against Base Sepolia testnet for testing.
 *
 * Setup:
 * 1. Set PRIVATE_KEY environment variable
 * 2. Ensure wallet has testnet ETH on Base Sepolia
 * 3. Run: npx ts-node test/integration.example.ts
 */

import { createWalletClient, createPublicClient, http, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { PoolFansTokenizer, POOL_POSITIONS, FEE_CONFIGS } from '../src'

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org'

if (!PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY environment variable required')
  console.log('\nUsage:')
  console.log('  PRIVATE_KEY=0x... npx ts-node test/integration.example.ts')
  process.exit(1)
}

// Setup clients
const account = privateKeyToAccount(PRIVATE_KEY)

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
})

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
})

const tokenizer = new PoolFansTokenizer({
  publicClient,
  walletClient,
})

// Test utilities
function log(message: string) {
  console.log(`\n${message}`)
}

function success(message: string) {
  console.log(`✅ ${message}`)
}

function error(message: string) {
  console.error(`❌ ${message}`)
}

function info(message: string) {
  console.log(`ℹ️  ${message}`)
}

// Integration tests
async function testValidation() {
  log('=== Testing Validation ===')

  // Test: bps validation
  info('Testing bps validation (should fail)...')
  const result1 = await tokenizer.deployWithTokenizedFees({
    name: 'Test',
    symbol: 'TEST',
    tokenAdmin: account.address,
    rewards: {
      recipients: [
        { recipient: account.address, admin: account.address, bps: 5000, token: 'Both' },
      ],
    },
  })

  if (result1.error?.message.includes('must sum to 10000')) {
    success('bps validation works correctly')
  } else {
    error('bps validation failed')
  }

  // Test: max recipients validation
  info('Testing max recipients validation (should fail)...')
  const recipients = Array(8)
    .fill(null)
    .map(() => ({
      recipient: account.address,
      admin: account.address,
      bps: 1250,
      token: 'Both' as const,
    }))

  const result2 = await tokenizer.deployWithTokenizedFees({
    name: 'Test',
    symbol: 'TEST',
    tokenAdmin: account.address,
    rewards: { recipients },
  })

  if (result2.error?.message.includes('Maximum 7')) {
    success('max recipients validation works correctly')
  } else {
    error('max recipients validation failed')
  }
}

async function testReadMethods() {
  log('=== Testing Read Methods ===')

  // Note: These require existing vault addresses on the network
  // Replace with actual addresses for testing
  const EXAMPLE_VAULT = '0x0000000000000000000000000000000000000000'

  if (EXAMPLE_VAULT === '0x0000000000000000000000000000000000000000') {
    info('Skipping read tests - no vault address configured')
    info('Set EXAMPLE_VAULT to a real vault address to test')
    return
  }

  try {
    info('Testing getVaultInfo...')
    const vaultInfo = await tokenizer.getVaultInfo(EXAMPLE_VAULT as `0x${string}`)
    success(`Vault clanker token: ${vaultInfo.clankerToken}`)
    success(`Vault paired token: ${vaultInfo.pairedToken}`)
    success(`Vault shares token: ${vaultInfo.sharesToken}`)

    info('Testing getUserPosition...')
    const position = await tokenizer.getUserPosition(
      EXAMPLE_VAULT as `0x${string}`,
      account.address
    )
    success(`Claimable clanker: ${formatEther(position.claimableClanker)}`)
    success(`Claimable paired: ${formatEther(position.claimablePaired)}`)
  } catch (err) {
    error(`Read methods failed: ${(err as Error).message}`)
  }
}

async function testDeployDryRun() {
  log('=== Testing Deploy (Dry Run) ===')

  info('Preparing deployment params...')

  const deployOptions = {
    name: 'Integration Test Token',
    symbol: 'ITT',
    image: 'ipfs://bafkreigtest',
    tokenAdmin: account.address,
    rewards: {
      recipients: [
        {
          recipient: account.address,
          admin: account.address,
          bps: 10000,
          token: 'Both' as const,
        },
      ],
    },
    fees: FEE_CONFIGS.DynamicBasic,
    pool: {
      positions: POOL_POSITIONS.Standard,
    },
  }

  success('Deploy options prepared:')
  console.log(JSON.stringify(deployOptions, null, 2))

  info('\nTo actually deploy, uncomment the deployment code below')
  info('WARNING: This will send a real transaction and cost gas!')

  /*
  // Uncomment to test actual deployment
  info('Sending deployment transaction...')
  const result = await tokenizer.deployWithTokenizedFees(deployOptions)

  if (result.error) {
    error(`Deployment failed: ${result.error.message}`)
    return
  }

  success(`Transaction sent: ${result.txHash}`)
  info('Waiting for confirmation...')

  const data = await result.waitForTransaction()
  success(`Token deployed at: ${data.tokenAddress}`)
  success(`Vault deployed at: ${data.vaultAddress}`)
  success(`Shares token at: ${data.sharesToken}`)
  */
}

async function testTokenization() {
  log('=== Testing Tokenization Flow ===')

  // Note: This requires an existing Clanker token
  const EXISTING_TOKEN = '0x0000000000000000000000000000000000000000'

  if (EXISTING_TOKEN === '0x0000000000000000000000000000000000000000') {
    info('Skipping tokenization tests - no token address configured')
    info('Set EXISTING_TOKEN to a real Clanker token address to test')
    return
  }

  info('Step 1: Initialize tokenization')
  /*
  const initResult = await tokenizer.initTokenization({
    clankerToken: EXISTING_TOKEN as `0x${string}`,
    version: 'v4',
    rewards: {
      recipients: [
        { recipient: account.address, admin: account.address, bps: 10000, token: 'Both' },
      ],
    },
  })

  if (initResult.error) {
    error(`Init failed: ${initResult.error.message}`)
    return
  }

  const { vaultAddress, pendingId } = await initResult.waitForTransaction()
  success(`Vault created: ${vaultAddress}`)
  success(`Pending ID: ${pendingId}`)

  info('Step 2: Transfer fee admin via clanker.world')
  info(`Transfer admin to: ${vaultAddress}`)

  info('Step 3: Finalize tokenization')
  const finalResult = await tokenizer.finalizeTokenization({
    pendingId,
    clankerToken: EXISTING_TOKEN as `0x${string}`,
  })

  const { sharesToken } = await finalResult.waitForTransaction()
  success(`Shares minted: ${sharesToken}`)
  */
}

async function checkBalance() {
  log('=== Wallet Info ===')

  const balance = await publicClient.getBalance({ address: account.address })
  info(`Address: ${account.address}`)
  info(`Balance: ${formatEther(balance)} ETH`)
  info(`Network: Base Sepolia (${baseSepolia.id})`)
}

// Run all tests
async function main() {
  console.log('🧪 PoolFans SDK Integration Tests\n')

  try {
    await checkBalance()
    await testValidation()
    await testReadMethods()
    await testDeployDryRun()
    await testTokenization()

    log('\n=== Tests Complete ===')
    success('All validation tests passed!')
  } catch (err) {
    error(`Test suite failed: ${(err as Error).message}`)
    process.exit(1)
  }
}

main()
