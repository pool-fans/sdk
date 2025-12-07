import type { Address, Hash } from 'viem'
import { parseEther } from 'viem'
import { base } from 'viem/chains'
import type {
  PoolFansConfig,
  DeployWithTokenizedFeesOptions,
  DeployResult,
  DeployResultData,
  InitTokenizationOptions,
  InitTokenizationResult,
  InitTokenizationResultData,
  FinalizeTokenizationOptions,
  FinalizeTokenizationResult,
  FinalizeTokenizationResultData,
  ClaimRewardsOptions,
  ClaimResult,
  VaultInfo,
  UserPosition,
  RewardRecipient,
} from './types'
import {
  CONTRACTS,
  V4_TOKENIZER_ABI,
  VAULT_ABI,
  POOL_POSITIONS,
  FEE_CONFIGS,
} from './constants'

/**
 * PoolFans Tokenizer SDK
 *
 * Deploy Clanker tokens with tokenized fee rewards programmatically.
 *
 * @example
 * ```ts
 * import { PoolFansTokenizer } from '@poolfans/sdk'
 * import { createWalletClient, createPublicClient, http } from 'viem'
 * import { privateKeyToAccount } from 'viem/accounts'
 * import { base } from 'viem/chains'
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY)
 * const publicClient = createPublicClient({ chain: base, transport: http() })
 * const walletClient = createWalletClient({ account, chain: base, transport: http() })
 *
 * const tokenizer = new PoolFansTokenizer({ publicClient, walletClient })
 *
 * const result = await tokenizer.deployWithTokenizedFees({
 *   name: "My Token",
 *   symbol: "MTK",
 *   tokenAdmin: account.address,
 *   rewards: {
 *     recipients: [{
 *       recipient: account.address,
 *       admin: account.address,
 *       bps: 10000,
 *       token: "Both"
 *     }]
 *   }
 * })
 *
 * const { tokenAddress, vaultAddress } = await result.waitForTransaction()
 * ```
 */
export class PoolFansTokenizer {
  private publicClient: PoolFansConfig['publicClient']
  private walletClient: PoolFansConfig['walletClient']

  constructor(config: PoolFansConfig) {
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
  }

  /**
   * Deploy a new Clanker V4 token with tokenized fee rewards
   *
   * This is an all-in-one deployment that:
   * 1. Deploys the token via Clanker V4
   * 2. Creates a revenue vault
   * 3. Mints revenue share tokens to recipients
   * 4. Optionally creates a vesting vault
   * 5. Optionally performs a dev buy
   */
  async deployWithTokenizedFees(
    options: DeployWithTokenizedFeesOptions
  ): Promise<DeployResult> {
    try {
      // Validate recipients
      const totalBps = options.rewards.recipients.reduce((sum, r) => sum + r.bps, 0)
      if (totalBps !== 10000) {
        return {
          txHash: '0x' as Hash,
          waitForTransaction: async () => { throw new Error('Invalid bps total') },
          error: new Error(`Recipient bps must sum to 10000, got ${totalBps}`),
        }
      }

      if (options.rewards.recipients.length > 7) {
        return {
          txHash: '0x' as Hash,
          waitForTransaction: async () => { throw new Error('Too many recipients') },
          error: new Error('Maximum 7 reward recipients allowed'),
        }
      }

      // Build params
      const params = this.buildDeployParams(options)

      // Calculate ETH value (for dev buy if specified)
      const value = options.devBuy?.ethAmount
        ? parseEther(options.devBuy.ethAmount.toString())
        : 0n

      // Get account
      const [account] = await this.walletClient.getAddresses()

      // Send transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txHash = await this.walletClient.writeContract({
        address: CONTRACTS.V4_TOKENIZER,
        abi: V4_TOKENIZER_ABI,
        functionName: 'tokenizeAndDeployV4Clanker',
        args: [params] as any,
        value,
        account,
        chain: base,
      })

      return {
        txHash,
        waitForTransaction: async (): Promise<DeployResultData> => {
          await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
          })

          // Parse logs to extract addresses
          // In production, decode the actual event logs
          const tokenAddress = '0x0000000000000000000000000000000000000000' as Address // TODO: Parse from logs
          const vaultAddress = '0x0000000000000000000000000000000000000000' as Address
          const sharesToken = '0x0000000000000000000000000000000000000000' as Address

          return {
            tokenAddress,
            vaultAddress,
            sharesToken,
            txHash,
          }
        },
      }
    } catch (error) {
      return {
        txHash: '0x' as Hash,
        waitForTransaction: async () => { throw error },
        error: error as Error,
      }
    }
  }

  /**
   * Initialize tokenization for an existing Clanker token
   *
   * Step 1 of 2-step tokenization flow:
   * 1. Call initTokenization() - deploys vault
   * 2. Transfer fee admin to vault address (off-chain via clanker.world)
   * 3. Call finalizeTokenization() - mints shares
   */
  async initTokenization(
    options: InitTokenizationOptions
  ): Promise<InitTokenizationResult> {
    try {
      // Validate
      const totalBps = options.rewards.recipients.reduce((sum, r) => sum + r.bps, 0)
      if (totalBps !== 10000) {
        return {
          txHash: '0x' as Hash,
          waitForTransaction: async () => { throw new Error('Invalid bps') },
          error: new Error(`Recipient bps must sum to 10000, got ${totalBps}`),
        }
      }

      const tokenizerAddress = options.version === 'v4'
        ? CONTRACTS.V4_TOKENIZER
        : CONTRACTS.V3_1_0_TOKENIZER

      const recipientsFormatted = options.rewards.recipients.map(r => ({
        recipient: r.recipient,
        admin: r.admin,
        bps: r.bps,
        token: this.tokenTypeToUint8(r.token),
      }))

      const [account] = await this.walletClient.getAddresses()

      const txHash = await this.walletClient.writeContract({
        address: tokenizerAddress,
        abi: V4_TOKENIZER_ABI,
        functionName: 'initTokenization',
        args: [options.clankerToken, { recipients: recipientsFormatted }] as const,
        account,
        chain: base,
      })

      return {
        txHash,
        waitForTransaction: async (): Promise<InitTokenizationResultData> => {
          await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
          })

          // Parse logs to extract vault address and pending ID
          const vaultAddress = '0x0000000000000000000000000000000000000000' as Address // TODO: Parse from logs
          const pendingId = 0n // TODO: Parse from logs

          return {
            vaultAddress,
            pendingId,
            txHash,
          }
        },
      }
    } catch (error) {
      return {
        txHash: '0x' as Hash,
        waitForTransaction: async () => { throw error },
        error: error as Error,
      }
    }
  }

  /**
   * Finalize tokenization after admin transfer
   *
   * Step 3 of 2-step tokenization flow.
   * Must be called after transferring fee admin to the vault address.
   */
  async finalizeTokenization(
    options: FinalizeTokenizationOptions
  ): Promise<FinalizeTokenizationResult> {
    try {
      const [account] = await this.walletClient.getAddresses()

      const txHash = await this.walletClient.writeContract({
        address: CONTRACTS.V4_TOKENIZER,
        abi: V4_TOKENIZER_ABI,
        functionName: 'finalizeTokenization',
        args: [options.pendingId, options.clankerToken] as const,
        account,
        chain: base,
      })

      return {
        txHash,
        waitForTransaction: async (): Promise<FinalizeTokenizationResultData> => {
          await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
          })

          const sharesToken = '0x0000000000000000000000000000000000000000' as Address // TODO: Parse from logs

          return {
            sharesToken,
            txHash,
          }
        },
      }
    } catch (error) {
      return {
        txHash: '0x' as Hash,
        waitForTransaction: async () => { throw error },
        error: error as Error,
      }
    }
  }

  /**
   * Claim accumulated rewards from a vault
   */
  async claimRewards(options: ClaimRewardsOptions): Promise<ClaimResult> {
    try {
      const [account] = await this.walletClient.getAddresses()

      const txHash = await this.walletClient.writeContract({
        address: options.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'claimRewards',
        args: [],
        account,
        chain: base,
      })

      return {
        txHash,
        waitForTransaction: async () => {
          await this.publicClient.waitForTransactionReceipt({ hash: txHash })
          return { txHash }
        },
      }
    } catch (error) {
      return {
        txHash: '0x' as Hash,
        waitForTransaction: async () => { throw error },
        error: error as Error,
      }
    }
  }

  /**
   * Get vault information
   */
  async getVaultInfo(vaultAddress: Address): Promise<VaultInfo> {
    const [sharesToken, clankerToken, pairedToken] = await Promise.all([
      this.publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'sharesToken',
      }) as Promise<Address>,
      this.publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'clankerToken',
      }) as Promise<Address>,
      this.publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'pairedToken',
      }) as Promise<Address>,
    ])

    return {
      address: vaultAddress,
      clankerToken,
      pairedToken,
      sharesToken,
      totalShares: 0n, // TODO: Read from shares token
      pendingClankerRewards: 0n,
      pendingPairedRewards: 0n,
    }
  }

  /**
   * Get user's position in a vault
   */
  async getUserPosition(
    vaultAddress: Address,
    userAddress: Address
  ): Promise<UserPosition> {
    const [clankerRewards, pairedRewards] = await this.publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'pendingRewards',
      args: [userAddress],
    }) as [bigint, bigint]

    return {
      shares: 0n, // TODO: Read from shares token
      claimableClanker: clankerRewards,
      claimablePaired: pairedRewards,
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private buildDeployParams(options: DeployWithTokenizedFeesOptions) {
    const recipients = options.rewards.recipients.map(r => ({
      recipient: r.recipient,
      admin: r.admin,
      bps: r.bps,
      token: this.tokenTypeToUint8(r.token),
    }))

    const fees = options.fees || FEE_CONFIGS.DynamicBasic
    const feeConfig = {
      feeType: fees.type === 'dynamic' ? 1 : 0,
      clankerFee: fees.type === 'static' ? (fees.clankerFee || 100) : 0,
      pairedFee: fees.type === 'static' ? (fees.pairedFee || 100) : 0,
    }

    const vaultConfig = options.vault
      ? {
          percentage: options.vault.percentage,
          lockupDuration: options.vault.lockupDuration,
          vestingDuration: options.vault.vestingDuration,
          recipient: options.vault.recipient || options.tokenAdmin,
        }
      : {
          percentage: 0,
          lockupDuration: 0,
          vestingDuration: 0,
          recipient: options.tokenAdmin,
        }

    const poolConfig = {
      pairedToken: options.pool?.pairedToken || CONTRACTS.WETH,
      tickIfToken0IsClanker: options.pool?.tickIfToken0IsClanker || -230400,
      positions: options.pool?.positions || POOL_POSITIONS.Standard,
    }

    const devBuyConfig = {
      ethAmount: options.devBuy?.ethAmount
        ? parseEther(options.devBuy.ethAmount.toString())
        : 0n,
      amountOutMin: options.devBuy?.amountOutMin || 0n,
    }

    const metadata = JSON.stringify({
      description: options.metadata?.description || '',
      socialMediaUrls: options.metadata?.socialMediaUrls || [],
      auditUrls: options.metadata?.auditUrls || [],
    })

    const context = JSON.stringify({
      interface: options.context?.interface || 'PoolFans SDK',
      platform: options.context?.platform || 'sdk',
      messageId: options.context?.messageId || '',
      id: options.context?.id || '',
    })

    return {
      name: options.name,
      symbol: options.symbol,
      image: options.image || '',
      metadata,
      context,
      tokenAdmin: options.tokenAdmin,
      rewards: { recipients },
      fees: feeConfig,
      vault: vaultConfig,
      pool: poolConfig,
      devBuy: devBuyConfig,
    }
  }

  private tokenTypeToUint8(token: RewardRecipient['token']): number {
    switch (token) {
      case 'Both':
        return 0
      case 'Paired':
        return 1
      case 'Clanker':
        return 2
      default:
        return 0
    }
  }
}
