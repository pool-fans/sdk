import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Address, Hash } from 'viem'
import { PoolFansTokenizer } from '../src/PoolFansTokenizer'
import { POOL_POSITIONS, FEE_CONFIGS, CONTRACTS } from '../src/constants'
import type { RewardRecipient } from '../src/types'

// Mock addresses
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as Address
const MOCK_ADDRESS_2 = '0x2345678901234567890123456789012345678901' as Address
const MOCK_TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash

// Create mock clients
function createMockClients() {
  const mockPublicClient = {
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
    readContract: vi.fn(),
  }

  const mockWalletClient = {
    getAddresses: vi.fn().mockResolvedValue([MOCK_ADDRESS]),
    writeContract: vi.fn().mockResolvedValue(MOCK_TX_HASH),
  }

  return { mockPublicClient, mockWalletClient }
}

describe('PoolFansTokenizer', () => {
  let tokenizer: PoolFansTokenizer
  let mockPublicClient: ReturnType<typeof createMockClients>['mockPublicClient']
  let mockWalletClient: ReturnType<typeof createMockClients>['mockWalletClient']

  beforeEach(() => {
    const mocks = createMockClients()
    mockPublicClient = mocks.mockPublicClient
    mockWalletClient = mocks.mockWalletClient

    tokenizer = new PoolFansTokenizer({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: mockPublicClient as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletClient: mockWalletClient as any,
    })
  })

  describe('deployWithTokenizedFees', () => {
    describe('validation', () => {
      it('should reject when bps do not sum to 10000', async () => {
        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              {
                recipient: MOCK_ADDRESS,
                admin: MOCK_ADDRESS,
                bps: 5000, // Only 50%
                token: 'Both',
              },
            ],
          },
        })

        expect(result.error).toBeDefined()
        expect(result.error?.message).toContain('must sum to 10000')
        expect(result.error?.message).toContain('5000')
      })

      it('should reject when bps exceed 10000', async () => {
        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 8000, token: 'Both' },
              { recipient: MOCK_ADDRESS_2, admin: MOCK_ADDRESS_2, bps: 5000, token: 'Both' },
            ],
          },
        })

        expect(result.error).toBeDefined()
        expect(result.error?.message).toContain('must sum to 10000')
        expect(result.error?.message).toContain('13000')
      })

      it('should reject more than 7 recipients', async () => {
        const recipients: RewardRecipient[] = Array(8)
          .fill(null)
          .map((_, i) => ({
            recipient: `0x${String(i).padStart(40, '0')}` as Address,
            admin: `0x${String(i).padStart(40, '0')}` as Address,
            bps: 1250,
            token: 'Both' as const,
          }))

        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: { recipients },
        })

        expect(result.error).toBeDefined()
        expect(result.error?.message).toContain('Maximum 7')
      })

      it('should accept exactly 7 recipients with valid bps', async () => {
        const recipients: RewardRecipient[] = [
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 2000, token: 'Both' },
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 2000, token: 'Both' },
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 1500, token: 'Both' },
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 1500, token: 'Both' },
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 1000, token: 'Both' },
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 1000, token: 'Both' },
          { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 1000, token: 'Both' },
        ]

        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: { recipients },
        })

        expect(result.error).toBeUndefined()
        expect(result.txHash).toBe(MOCK_TX_HASH)
      })
    })

    describe('successful deployment', () => {
      it('should deploy with minimal options', async () => {
        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              {
                recipient: MOCK_ADDRESS,
                admin: MOCK_ADDRESS,
                bps: 10000,
                token: 'Both',
              },
            ],
          },
        })

        expect(result.error).toBeUndefined()
        expect(result.txHash).toBe(MOCK_TX_HASH)
        expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(1)
      })

      it('should deploy with all options', async () => {
        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Full Test Token',
          symbol: 'FULL',
          image: 'ipfs://test-image',
          tokenAdmin: MOCK_ADDRESS,
          metadata: {
            description: 'A test token',
            socialMediaUrls: ['https://twitter.com/test'],
            auditUrls: ['https://audit.com/test'],
          },
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 6000, token: 'Both' },
              { recipient: MOCK_ADDRESS_2, admin: MOCK_ADDRESS_2, bps: 4000, token: 'Paired' },
            ],
          },
          fees: FEE_CONFIGS.DynamicBasic,
          vault: {
            percentage: 20,
            lockupDuration: 604800,
            vestingDuration: 2592000,
            recipient: MOCK_ADDRESS,
          },
          devBuy: {
            ethAmount: 0.1,
          },
          pool: {
            positions: POOL_POSITIONS.Standard,
          },
          context: {
            interface: 'Test SDK',
            platform: 'test',
          },
        })

        expect(result.error).toBeUndefined()
        expect(result.txHash).toBe(MOCK_TX_HASH)
      })

      it('should include ETH value for dev buy', async () => {
        await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
            ],
          },
          devBuy: {
            ethAmount: 0.5,
          },
        })

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            value: 500000000000000000n, // 0.5 ETH in wei
          })
        )
      })

      it('should call correct contract address', async () => {
        await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
            ],
          },
        })

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            address: CONTRACTS.V4_TOKENIZER,
            functionName: 'tokenizeAndDeployV4Clanker',
          })
        )
      })
    })

    describe('waitForTransaction', () => {
      it('should wait for transaction receipt', async () => {
        const result = await tokenizer.deployWithTokenizedFees({
          name: 'Test Token',
          symbol: 'TEST',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
            ],
          },
        })

        const data = await result.waitForTransaction()

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
          hash: MOCK_TX_HASH,
        })
        expect(data.txHash).toBe(MOCK_TX_HASH)
      })
    })

    describe('token type conversion', () => {
      it('should convert "Both" to 0', async () => {
        await tokenizer.deployWithTokenizedFees({
          name: 'Test',
          symbol: 'T',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
            ],
          },
        })

        const callArgs = mockWalletClient.writeContract.mock.calls[0][0]
        expect(callArgs.args[0].rewards.recipients[0].token).toBe(0)
      })

      it('should convert "Paired" to 1', async () => {
        await tokenizer.deployWithTokenizedFees({
          name: 'Test',
          symbol: 'T',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Paired' },
            ],
          },
        })

        const callArgs = mockWalletClient.writeContract.mock.calls[0][0]
        expect(callArgs.args[0].rewards.recipients[0].token).toBe(1)
      })

      it('should convert "Clanker" to 2', async () => {
        await tokenizer.deployWithTokenizedFees({
          name: 'Test',
          symbol: 'T',
          tokenAdmin: MOCK_ADDRESS,
          rewards: {
            recipients: [
              { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Clanker' },
            ],
          },
        })

        const callArgs = mockWalletClient.writeContract.mock.calls[0][0]
        expect(callArgs.args[0].rewards.recipients[0].token).toBe(2)
      })
    })
  })

  describe('initTokenization', () => {
    it('should validate bps sum to 10000', async () => {
      const result = await tokenizer.initTokenization({
        clankerToken: MOCK_ADDRESS,
        version: 'v4',
        rewards: {
          recipients: [
            { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 3000, token: 'Both' },
          ],
        },
      })

      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('must sum to 10000')
    })

    it('should use V4 tokenizer for v4 version', async () => {
      await tokenizer.initTokenization({
        clankerToken: MOCK_ADDRESS,
        version: 'v4',
        rewards: {
          recipients: [
            { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
          ],
        },
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACTS.V4_TOKENIZER,
        })
      )
    })

    it('should use V3.1.0 tokenizer for v3.1.0 version', async () => {
      await tokenizer.initTokenization({
        clankerToken: MOCK_ADDRESS,
        version: 'v3.1.0',
        rewards: {
          recipients: [
            { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
          ],
        },
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACTS.V3_1_0_TOKENIZER,
        })
      )
    })

    it('should call initTokenization function', async () => {
      await tokenizer.initTokenization({
        clankerToken: MOCK_ADDRESS,
        version: 'v4',
        rewards: {
          recipients: [
            { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
          ],
        },
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'initTokenization',
        })
      )
    })
  })

  describe('finalizeTokenization', () => {
    it('should call finalizeTokenization with correct args', async () => {
      const pendingId = 123n

      await tokenizer.finalizeTokenization({
        pendingId,
        clankerToken: MOCK_ADDRESS,
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACTS.V4_TOKENIZER,
          functionName: 'finalizeTokenization',
          args: [pendingId, MOCK_ADDRESS],
        })
      )
    })

    it('should return txHash and waitForTransaction', async () => {
      const result = await tokenizer.finalizeTokenization({
        pendingId: 123n,
        clankerToken: MOCK_ADDRESS,
      })

      expect(result.txHash).toBe(MOCK_TX_HASH)
      expect(result.waitForTransaction).toBeDefined()
    })
  })

  describe('claimRewards', () => {
    it('should call claimRewards on vault address', async () => {
      const vaultAddress = MOCK_ADDRESS_2

      await tokenizer.claimRewards({ vaultAddress })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: vaultAddress,
          functionName: 'claimRewards',
          args: [],
        })
      )
    })

    it('should return txHash', async () => {
      const result = await tokenizer.claimRewards({ vaultAddress: MOCK_ADDRESS })

      expect(result.txHash).toBe(MOCK_TX_HASH)
    })
  })

  describe('getVaultInfo', () => {
    it('should read vault info from contract', async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(MOCK_ADDRESS) // sharesToken
        .mockResolvedValueOnce(MOCK_ADDRESS_2) // clankerToken
        .mockResolvedValueOnce(CONTRACTS.WETH) // pairedToken

      const info = await tokenizer.getVaultInfo(MOCK_ADDRESS)

      expect(info.address).toBe(MOCK_ADDRESS)
      expect(info.sharesToken).toBe(MOCK_ADDRESS)
      expect(info.clankerToken).toBe(MOCK_ADDRESS_2)
      expect(info.pairedToken).toBe(CONTRACTS.WETH)
    })

    it('should call readContract with correct function names', async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(MOCK_ADDRESS)
        .mockResolvedValueOnce(MOCK_ADDRESS)
        .mockResolvedValueOnce(MOCK_ADDRESS)

      await tokenizer.getVaultInfo(MOCK_ADDRESS)

      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'sharesToken' })
      )
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'clankerToken' })
      )
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'pairedToken' })
      )
    })
  })

  describe('getUserPosition', () => {
    it('should return user position with claimable rewards', async () => {
      const clankerRewards = 1000000000000000000n // 1 token
      const pairedRewards = 500000000000000000n // 0.5 WETH

      mockPublicClient.readContract.mockResolvedValueOnce([clankerRewards, pairedRewards])

      const position = await tokenizer.getUserPosition(MOCK_ADDRESS, MOCK_ADDRESS_2)

      expect(position.claimableClanker).toBe(clankerRewards)
      expect(position.claimablePaired).toBe(pairedRewards)
    })

    it('should call pendingRewards with user address', async () => {
      mockPublicClient.readContract.mockResolvedValueOnce([0n, 0n])

      await tokenizer.getUserPosition(MOCK_ADDRESS, MOCK_ADDRESS_2)

      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: MOCK_ADDRESS,
          functionName: 'pendingRewards',
          args: [MOCK_ADDRESS_2],
        })
      )
    })
  })

  describe('error handling', () => {
    it('should catch and return errors from writeContract', async () => {
      const error = new Error('Insufficient funds')
      mockWalletClient.writeContract.mockRejectedValueOnce(error)

      const result = await tokenizer.deployWithTokenizedFees({
        name: 'Test',
        symbol: 'T',
        tokenAdmin: MOCK_ADDRESS,
        rewards: {
          recipients: [
            { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
          ],
        },
      })

      expect(result.error).toBe(error)
    })

    it('should throw error when calling waitForTransaction after error', async () => {
      const error = new Error('Network error')
      mockWalletClient.writeContract.mockRejectedValueOnce(error)

      const result = await tokenizer.deployWithTokenizedFees({
        name: 'Test',
        symbol: 'T',
        tokenAdmin: MOCK_ADDRESS,
        rewards: {
          recipients: [
            { recipient: MOCK_ADDRESS, admin: MOCK_ADDRESS, bps: 10000, token: 'Both' },
          ],
        },
      })

      await expect(result.waitForTransaction()).rejects.toThrow('Network error')
    })
  })
})

describe('Constants', () => {
  describe('POOL_POSITIONS', () => {
    it('Standard positions should sum to 10000 bps', () => {
      const total = POOL_POSITIONS.Standard.reduce((sum, p) => sum + p.positionBps, 0)
      expect(total).toBe(10000)
    })

    it('Project positions should sum to 10000 bps', () => {
      const total = POOL_POSITIONS.Project.reduce((sum, p) => sum + p.positionBps, 0)
      expect(total).toBe(10000)
    })

    it('Legacy positions should sum to 10000 bps', () => {
      const total = POOL_POSITIONS.Legacy.reduce((sum, p) => sum + p.positionBps, 0)
      expect(total).toBe(10000)
    })
  })

  describe('FEE_CONFIGS', () => {
    it('DynamicBasic should have correct type', () => {
      expect(FEE_CONFIGS.DynamicBasic.type).toBe('dynamic')
    })

    it('Static1Percent should have correct type', () => {
      expect(FEE_CONFIGS.Static1Percent.type).toBe('static')
    })

    it('Static configs should have fee values', () => {
      expect(FEE_CONFIGS.Static1Percent.clankerFee).toBe(100)
      expect(FEE_CONFIGS.Static1Percent.pairedFee).toBe(100)
    })
  })

  describe('CONTRACTS', () => {
    it('should have valid V4 tokenizer address', () => {
      expect(CONTRACTS.V4_TOKENIZER).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('should have valid WETH address', () => {
      expect(CONTRACTS.WETH).toBe('0x4200000000000000000000000000000000000006')
    })
  })
})
