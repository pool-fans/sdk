import type { Address, Hash, PublicClient, WalletClient } from 'viem'

// ============================================
// SDK Configuration
// ============================================

export interface PoolFansConfig {
  publicClient: PublicClient
  walletClient: WalletClient
}

// ============================================
// Token Deployment Types
// ============================================

export type TokenType = 'Both' | 'Paired' | 'Clanker'

export interface RewardRecipient {
  /** Address to receive revenue share tokens */
  recipient: Address
  /** Address that can manage this position */
  admin: Address
  /** Basis points (0-10000, sum of all recipients must equal 10000) */
  bps: number
  /** Which tokens to receive fees in */
  token: TokenType
}

export interface RewardsConfig {
  /** Up to 7 recipients for fee distribution */
  recipients: RewardRecipient[]
}

export interface StaticFeeConfig {
  type: 'static'
  /** Fee rate in basis points for clanker token side */
  clankerFee?: number
  /** Fee rate in basis points for paired token side */
  pairedFee?: number
}

export interface DynamicFeeConfig {
  type: 'dynamic'
  /** Starting fee rate (high for MEV protection) */
  startFee?: number
  /** Ending fee rate after decay */
  endFee?: number
  /** Decay duration in seconds */
  decayDuration?: number
}

export type FeeConfig = StaticFeeConfig | DynamicFeeConfig

export interface VaultConfig {
  /** Percentage of supply to lock (10-90) */
  percentage: number
  /** Lockup duration in seconds (minimum 7 days = 604800) */
  lockupDuration: number
  /** Vesting duration in seconds (can be 0 for cliff unlock) */
  vestingDuration: number
  /** Recipient of vested tokens (defaults to tokenAdmin) */
  recipient?: Address
}

export interface DevBuyConfig {
  /** Amount of ETH to buy at launch */
  ethAmount: number
  /** Minimum tokens to receive (slippage protection) */
  amountOutMin?: bigint
}

export interface TokenMetadata {
  /** Token description */
  description?: string
  /** Social media URLs */
  socialMediaUrls?: string[]
  /** Audit report URLs */
  auditUrls?: string[]
}

export interface PoolPosition {
  /** Lower tick bound */
  tickLower: number
  /** Upper tick bound */
  tickUpper: number
  /** Position size in basis points */
  positionBps: number
}

export interface PoolConfig {
  /** Token to pair with (defaults to WETH) */
  pairedToken?: Address
  /** Initial tick if clanker is token0 */
  tickIfToken0IsClanker?: number
  /** Custom LP positions (uses default 5-position if not specified) */
  positions?: PoolPosition[]
}

export interface SocialContext {
  /** Interface that deployed (e.g., "PoolFans SDK") */
  interface?: string
  /** Platform (e.g., "farcaster", "web") */
  platform?: string
  /** Message/cast ID for provenance */
  messageId?: string
  /** Additional context ID */
  id?: string
}

// ============================================
// Deployment Options
// ============================================

export interface DeployWithTokenizedFeesOptions {
  /** Token name */
  name: string
  /** Token symbol */
  symbol: string
  /** Token image URL (IPFS or HTTP) */
  image?: string
  /** Admin wallet address */
  tokenAdmin: Address
  /** Optional metadata */
  metadata?: TokenMetadata
  /** Rewards configuration with tokenization */
  rewards: RewardsConfig
  /** Fee configuration */
  fees?: FeeConfig
  /** Optional vesting vault */
  vault?: VaultConfig
  /** Optional dev buy at launch */
  devBuy?: DevBuyConfig
  /** Pool configuration */
  pool?: PoolConfig
  /** Social context for provenance */
  context?: SocialContext
  /** Generate vanity address with "b07" suffix */
  vanity?: boolean
}

export interface InitTokenizationOptions {
  /** Existing Clanker token address */
  clankerToken: Address
  /** Clanker version */
  version: 'v4' | 'v3.1.0'
  /** Rewards configuration */
  rewards: RewardsConfig
  /** Fee position type (V3.1.0 only) */
  feePosition?: 'creator' | 'interfacer'
}

export interface FinalizeTokenizationOptions {
  /** Pending tokenization ID from initTokenization */
  pendingId: bigint
  /** Clanker token address */
  clankerToken: Address
}

// ============================================
// Result Types
// ============================================

export interface DeployResult {
  /** Transaction hash */
  txHash: Hash
  /** Wait for transaction confirmation */
  waitForTransaction: () => Promise<DeployResultData>
  /** Error if deployment failed before sending tx */
  error?: Error
}

export interface DeployResultData {
  /** Deployed token address */
  tokenAddress: Address
  /** Revenue vault address */
  vaultAddress: Address
  /** Revenue share token address */
  sharesToken: Address
  /** Transaction hash */
  txHash: Hash
}

export interface InitTokenizationResult {
  /** Transaction hash */
  txHash: Hash
  /** Wait for transaction confirmation */
  waitForTransaction: () => Promise<InitTokenizationResultData>
  /** Error if failed */
  error?: Error
}

export interface InitTokenizationResultData {
  /** Deployed vault address */
  vaultAddress: Address
  /** Pending tokenization ID */
  pendingId: bigint
  /** Transaction hash */
  txHash: Hash
}

export interface FinalizeTokenizationResult {
  /** Transaction hash */
  txHash: Hash
  /** Wait for transaction confirmation */
  waitForTransaction: () => Promise<FinalizeTokenizationResultData>
  /** Error if failed */
  error?: Error
}

export interface FinalizeTokenizationResultData {
  /** Revenue share token address */
  sharesToken: Address
  /** Transaction hash */
  txHash: Hash
}

// ============================================
// Claim Types
// ============================================

export interface ClaimRewardsOptions {
  /** Vault address to claim from */
  vaultAddress: Address
}

export interface ClaimResult {
  /** Transaction hash */
  txHash: Hash
  /** Wait for transaction confirmation */
  waitForTransaction: () => Promise<{ txHash: Hash }>
  /** Error if failed */
  error?: Error
}

// ============================================
// Query Types
// ============================================

export interface VaultInfo {
  /** Vault address */
  address: Address
  /** Clanker token address */
  clankerToken: Address
  /** Paired token address */
  pairedToken: Address
  /** Revenue share token address */
  sharesToken: Address
  /** Total shares supply */
  totalShares: bigint
  /** Pending rewards for clanker token */
  pendingClankerRewards: bigint
  /** Pending rewards for paired token */
  pendingPairedRewards: bigint
}

export interface UserPosition {
  /** Share token balance */
  shares: bigint
  /** Claimable clanker rewards */
  claimableClanker: bigint
  /** Claimable paired rewards */
  claimablePaired: bigint
}
