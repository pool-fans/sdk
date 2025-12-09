import type { Address, Hash } from 'viem'
import { parseEther, encodeAbiParameters, parseAbiParameters, keccak256, encodeDeployData, getCreate2Address } from 'viem'
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
  CLANKER_TOKEN_ABI,
  CLANKER_TOKEN_BYTECODE,
  CLANKER_DEPLOYER,
  DEV_BUY_EXTENSION,
  FeePreference,
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

      // Build params matching ABI structure (with async vault address computation)
      const { config, shareRecipients } = await this.buildDeployParamsAsync(options)

      // Log deployment params for debugging
      console.log('\n📋 Deployment Parameters:')
      console.log(JSON.stringify({
        tokenConfig: config.tokenConfig,
        poolConfig: {
          ...config.poolConfig,
          poolData: config.poolConfig.poolData.slice(0, 66) + '...',
        },
        lockerConfig: {
          ...config.lockerConfig,
          lockerData: config.lockerConfig.lockerData,
        },
        mevModuleConfig: config.mevModuleConfig,
        extensionConfigs: config.extensionConfigs,
        shareRecipients,
      }, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))

      // Calculate ETH value (for dev buy if specified)
      const value = options.devBuy?.ethAmount
        ? parseEther(options.devBuy.ethAmount.toString())
        : 0n

      // Get account - use wallet client's account directly for local signing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = (this.walletClient as any).account

      // Send transaction with correct args: (config, shareRecipients)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txHash = await this.walletClient.writeContract({
        address: CONTRACTS.V4_TOKENIZER,
        abi: V4_TOKENIZER_ABI,
        functionName: 'tokenizeAndDeployV4Clanker',
        args: [config, shareRecipients] as any,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = (this.walletClient as any).account

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txHash = await this.walletClient.writeContract({
        address: tokenizerAddress,
        abi: V4_TOKENIZER_ABI as any,
        functionName: 'initTokenization' as any,
        args: [options.clankerToken, { recipients: recipientsFormatted }] as any,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = (this.walletClient as any).account

      const txHash = await this.walletClient.writeContract({
        address: CONTRACTS.V4_TOKENIZER,
        abi: V4_TOKENIZER_ABI,
        functionName: 'finalizeTokenization',
        args: [options.clankerToken, options.pendingId] as const,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = (this.walletClient as any).account

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

  /**
   * Build deployment params with async vault address computation
   * This fetches vault addresses from the tokenizer contract
   */
  private async buildDeployParamsAsync(options: DeployWithTokenizedFeesOptions): Promise<{
    config: {
      tokenConfig: {
        tokenAdmin: Address
        name: string
        symbol: string
        salt: `0x${string}`
        image: string
        metadata: string
        context: string
        originatingChainId: bigint
      }
      poolConfig: {
        hook: Address
        pairedToken: Address
        tickIfToken0IsClanker: number
        tickSpacing: number
        poolData: `0x${string}`
      }
      lockerConfig: {
        locker: Address
        rewardAdmins: Address[]
        rewardRecipients: Address[]
        rewardBps: number[]
        tickLower: number[]
        tickUpper: number[]
        positionBps: number[]
        lockerData: `0x${string}`
      }
      mevModuleConfig: {
        mevModule: Address
        mevModuleData: `0x${string}`
      }
      extensionConfigs: Array<{
        extension: Address
        msgValue: bigint
        extensionBps: number
        extensionData: `0x${string}`
      }>
    }
    shareRecipients: Address[]
  }> {
    // Generate random salt for unique token address
    const salt = this.generateSalt()

    // Build metadata JSON
    const metadata = JSON.stringify({
      description: options.metadata?.description || '',
      socialMediaUrls: options.metadata?.socialMediaUrls || [],
      auditUrls: options.metadata?.auditUrls || [],
    })

    // Build context JSON
    const context = JSON.stringify({
      interface: options.context?.interface || 'PoolFans SDK',
      platform: options.context?.platform || 'sdk',
      messageId: options.context?.messageId || '',
      id: options.context?.id || '',
    })

    // Token config
    const tokenConfig = {
      tokenAdmin: options.tokenAdmin,
      name: options.name,
      symbol: options.symbol,
      salt,
      image: options.image || '',
      metadata,
      context,
      originatingChainId: BigInt(base.id),
    }

    // Pool config
    const positions = options.pool?.positions || POOL_POSITIONS.Standard
    const pairedToken = options.pool?.pairedToken || CONTRACTS.WETH
    const poolData = this.encodePoolDataV2()

    const poolConfig = {
      hook: CONTRACTS.V4_HOOK,
      pairedToken,
      tickIfToken0IsClanker: options.pool?.tickIfToken0IsClanker || -230400,
      tickSpacing: 200,
      poolData,
    }

    // Convert token preference to FeePreference enum
    const feePreferences = options.rewards.recipients.map(r =>
      this.tokenTypeToFeePreference(r.token)
    )

    // Compute CREATE2 clanker token address
    const clankerAddress = this.computeClankerAddress(
      tokenConfig.name,
      tokenConfig.symbol,
      tokenConfig.tokenAdmin,
      tokenConfig.image,
      metadata,
      context,
      tokenConfig.originatingChainId,
      salt
    )

    console.log('\n📍 Computing addresses...')
    console.log('  Predicted Clanker Token:', clankerAddress)

    // Fetch vault addresses from the tokenizer contract
    const vaultAddresses: Address[] = []
    for (let i = 0; i < feePreferences.length; i++) {
      const vaultAddr = await this.computeVaultAddressOnChain(
        clankerAddress,
        pairedToken,
        feePreferences[i]
      )
      vaultAddresses.push(vaultAddr)
      console.log(`  Vault ${i} (${FeePreference[feePreferences[i]]}):`, vaultAddr)
    }

    // CRITICAL: rewardAdmins and rewardRecipients must be vault addresses
    const rewardAdmins = vaultAddresses
    const rewardRecipients = vaultAddresses
    const rewardBps = options.rewards.recipients.map(r => r.bps)

    // Extract tick ranges and position bps
    const tickLower = positions.map(p => p.tickLower)
    const tickUpper = positions.map(p => p.tickUpper)
    const positionBps = positions.map(p => p.positionBps)

    // Encode locker data with fee preferences
    const lockerData = this.encodeLockerData(feePreferences)

    const lockerConfig = {
      locker: CONTRACTS.FEE_LOCKER,
      rewardAdmins,
      rewardRecipients,
      rewardBps,
      tickLower,
      tickUpper,
      positionBps,
      lockerData,
    }

    // MEV module config - V2 requires sniper auction data
    const mevModuleConfig = {
      mevModule: CONTRACTS.MEV_MODULE,
      mevModuleData: this.encodeMevModuleData(),
    }

    // Extension configs
    const extensionConfigs: Array<{
      extension: Address
      msgValue: bigint
      extensionBps: number
      extensionData: `0x${string}`
    }> = []

    if (options.devBuy?.ethAmount) {
      extensionConfigs.push({
        extension: DEV_BUY_EXTENSION,
        msgValue: parseEther(options.devBuy.ethAmount.toString()),
        extensionBps: 0,
        extensionData: this.encodeDevBuyData(options.tokenAdmin),
      })
    }

    // Share recipients - the actual users who will receive vault shares
    const shareRecipients = options.rewards.recipients.map(r => r.recipient)

    return {
      config: {
        tokenConfig,
        poolConfig,
        lockerConfig,
        mevModuleConfig,
        extensionConfigs,
      },
      shareRecipients,
    }
  }

  /**
   * Generate a random salt for CREATE2 deployment
   */
  private generateSalt(): `0x${string}` {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
  }

  /**
   * Compute the CREATE2 address for a Clanker token
   * Uses the Clanker V4 factory deployment logic
   */
  private computeClankerAddress(
    name: string,
    symbol: string,
    tokenAdmin: Address,
    image: string,
    metadata: string,
    context: string,
    originatingChainId: bigint,
    randomSalt: `0x${string}`
  ): Address {
    const supply = BigInt('100000000000000000000000000000') // 100B tokens with 18 decimals

    // Encode deployment data
    const deployData = encodeDeployData({
      abi: CLANKER_TOKEN_ABI,
      bytecode: CLANKER_TOKEN_BYTECODE,
      args: [name, symbol, supply, tokenAdmin, image, metadata, context, originatingChainId],
    })

    const initCodeHash = keccak256(deployData)

    // Compute salt: keccak256(abi.encode(admin, randomSalt))
    const computedSalt = keccak256(
      encodeAbiParameters(
        parseAbiParameters('address, bytes32'),
        [tokenAdmin, randomSalt]
      )
    )

    // Predict address using CREATE2
    return getCreate2Address({
      from: CLANKER_DEPLOYER,
      salt: computedSalt,
      bytecodeHash: initCodeHash,
    })
  }

  /**
   * Fetch vault address from the tokenizer contract
   * Uses the computeVaultAddress view function
   */
  async computeVaultAddressOnChain(
    clankerToken: Address,
    pairedToken: Address,
    feePreference: FeePreference
  ): Promise<Address> {
    return await this.publicClient.readContract({
      address: CONTRACTS.V4_TOKENIZER,
      abi: V4_TOKENIZER_ABI,
      functionName: 'computeVaultAddress',
      args: [clankerToken, pairedToken, feePreference],
    }) as Address
  }

  /**
   * Encode pool data for V2 hooks with dynamic fee configuration
   */
  private encodePoolDataV2(): `0x${string}` {
    // Default dynamic fee configuration
    const feeConfig = {
      baseFee: 100, // 1% (10000 uniBps)
      maxFee: 500, // 5% (50000 uniBps)
      referenceTickFilterPeriod: 30, // 30 seconds
      resetPeriod: 120, // 120 seconds
      resetTickFilter: 200, // 200 bps
      feeControlNumerator: 500000000,
      decayFilterBps: 7500, // 75% decay rate
    }

    // Encode dynamic fee data
    const feeData = encodeAbiParameters(
      parseAbiParameters('uint256, uint256, uint256, uint256, uint256, uint256, uint256'),
      [
        BigInt(feeConfig.baseFee * 100),
        BigInt(feeConfig.maxFee * 100),
        BigInt(feeConfig.referenceTickFilterPeriod),
        BigInt(feeConfig.resetPeriod),
        BigInt(feeConfig.resetTickFilter),
        BigInt(feeConfig.feeControlNumerator),
        BigInt(feeConfig.decayFilterBps),
      ]
    )

    // Wrap in pool initialization data for V2 hooks
    // Format: { extension: address, extensionData: bytes, feeData: bytes }
    return encodeAbiParameters(
      parseAbiParameters('(address extension, bytes extensionData, bytes feeData)'),
      [{
        extension: '0x0000000000000000000000000000000000000000' as Address,
        extensionData: '0x' as `0x${string}`,
        feeData,
      }]
    )
  }

  /**
   * Encode locker data with fee preferences
   * Format: { feePreference: uint8[] }
   */
  private encodeLockerData(feePreferences: FeePreference[]): `0x${string}` {
    return encodeAbiParameters(
      parseAbiParameters('(uint8[] feePreference)'),
      [{ feePreference: feePreferences.map(f => f as number) }]
    )
  }

  /**
   * Encode MEV module sniper auction data for V2 module
   * Uses default values matching successful deployments
   */
  private encodeMevModuleData(): `0x${string}` {
    // Default sniper auction config (matches clanker.world deployments)
    const config = {
      startingFee: 666777n, // 66.68% in uniBps
      endingFee: 41673n,    // 4.17% in uniBps
      secondsToDecay: 15n,  // 15 seconds
    }

    return encodeAbiParameters(
      parseAbiParameters('uint256, uint256, uint256'),
      [config.startingFee, config.endingFee, config.secondsToDecay]
    )
  }

  /**
   * Encode dev buy extension data
   */
  private encodeDevBuyData(recipient: Address): `0x${string}` {
    // DevBuy expects: (PoolKey, uint256 amountOutMinimum, address recipient)
    // When paired with WETH, use null pool config
    return encodeAbiParameters(
      parseAbiParameters('(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 amountOutMinimum, address recipient'),
      [
        {
          currency0: '0x0000000000000000000000000000000000000000' as Address,
          currency1: '0x0000000000000000000000000000000000000000' as Address,
          fee: 0,
          tickSpacing: 0,
          hooks: '0x0000000000000000000000000000000000000000' as Address,
        },
        0n,
        recipient,
      ]
    )
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

  private tokenTypeToFeePreference(token: RewardRecipient['token']): FeePreference {
    switch (token) {
      case 'Both':
        return FeePreference.Both
      case 'Paired':
        return FeePreference.Paired
      case 'Clanker':
        return FeePreference.Clanker
      default:
        return FeePreference.Both
    }
  }
}
