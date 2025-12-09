/**
 * PoolFans SDK
 *
 * TypeScript SDK for deploying Clanker tokens with tokenized fee rewards.
 *
 * @example
 * ```ts
 * import { PoolFansTokenizer, POOL_POSITIONS, FEE_CONFIGS } from '@poolfans/sdk'
 * import { createWalletClient, createPublicClient, http } from 'viem'
 * import { privateKeyToAccount } from 'viem/accounts'
 * import { base } from 'viem/chains'
 *
 * // Setup clients
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)
 * const publicClient = createPublicClient({ chain: base, transport: http() })
 * const walletClient = createWalletClient({ account, chain: base, transport: http() })
 *
 * // Initialize SDK
 * const tokenizer = new PoolFansTokenizer({ publicClient, walletClient })
 *
 * // Deploy with tokenized fees
 * const result = await tokenizer.deployWithTokenizedFees({
 *   name: "My Token",
 *   symbol: "MTK",
 *   tokenAdmin: account.address,
 *   rewards: {
 *     recipients: [{
 *       recipient: account.address,
 *       admin: account.address,
 *       bps: 10000,  // 100%
 *       token: "Both"
 *     }]
 *   },
 *   fees: FEE_CONFIGS.DynamicBasic,
 *   pool: { positions: POOL_POSITIONS.Standard }
 * })
 *
 * const { tokenAddress, vaultAddress, sharesToken } = await result.waitForTransaction()
 * console.log('Token:', tokenAddress)
 * console.log('Vault:', vaultAddress)
 * console.log('Shares:', sharesToken)
 * ```
 *
 * @packageDocumentation
 */

// Main SDK class
export { PoolFansTokenizer } from './PoolFansTokenizer'

// Constants & Presets
export {
  CONTRACTS,
  SUPPORTED_CHAINS,
  POOL_POSITIONS,
  FEE_CONFIGS,
  VAULT_PRESETS,
  V4_TOKENIZER_ABI,
  VAULT_ABI,
} from './constants'

// Types
export type {
  // Config
  PoolFansConfig,

  // Token Types
  TokenType,
  RewardRecipient,
  RewardsConfig,

  // Fee Types
  StaticFeeConfig,
  DynamicFeeConfig,
  FeeConfig,

  // Vault Types
  VaultConfig,
  DevBuyConfig,

  // Pool Types
  PoolPosition,
  PoolConfig,

  // Metadata
  TokenMetadata,
  SocialContext,

  // Deployment Options
  DeployWithTokenizedFeesOptions,
  InitTokenizationOptions,
  FinalizeTokenizationOptions,

  // Results
  DeployResult,
  DeployResultData,
  InitTokenizationResult,
  InitTokenizationResultData,
  FinalizeTokenizationResult,
  FinalizeTokenizationResultData,

  // Claims
  ClaimRewardsOptions,
  ClaimResult,

  // Query
  VaultInfo,
  UserPosition,
} from './types'

// Version
export const VERSION = '0.2.0'
