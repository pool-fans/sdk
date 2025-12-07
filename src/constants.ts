import type { Address } from 'viem'

// ============================================
// Contract Addresses (Base Mainnet)
// ============================================

export const CONTRACTS = {
  /** V4 Tokenizer Factory */
  V4_TOKENIZER: '0xea8127533f7be6d04b3dba8f0a496f2dcfd27728' as Address,

  /** V3.1.0 Tokenizer Factory */
  V3_1_0_TOKENIZER: '0x50e2a7193c4ad03221f4b4e3e33cdf1a46671ced' as Address,

  /** Revenue Share Registry (immutable) */
  REGISTRY: '0x0000000000000000000000000000000000000000' as Address, // TODO: Add actual address

  /** WETH on Base */
  WETH: '0x4200000000000000000000000000000000000006' as Address,

  /** Clanker V4 Factory */
  CLANKER_V4_FACTORY: '0x0000000000000000000000000000000000000000' as Address, // TODO: Add actual address

  /** Clanker Fee Locker */
  FEE_LOCKER: '0x0000000000000000000000000000000000000000' as Address, // TODO: Add actual address
} as const

// ============================================
// Chain Configuration
// ============================================

export const SUPPORTED_CHAINS = {
  BASE: 8453,
  BASE_SEPOLIA: 84532,
} as const

export type SupportedChainId = typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS]

// ============================================
// Default LP Positions (Clanker Standard)
// ============================================

export const POOL_POSITIONS = {
  /** Standard 5-position meme token setup */
  Standard: [
    { tickLower: -230400, tickUpper: -214200, positionBps: 1000 },  // 10% - Floor
    { tickLower: -214200, tickUpper: -160000, positionBps: 5000 },  // 50% - Core
    { tickLower: -160000, tickUpper: -120000, positionBps: 1500 },  // 15% - Growth
    { tickLower: -120000, tickUpper: -92100, positionBps: 2000 },   // 20% - Expansion
    { tickLower: -92100, tickUpper: -60000, positionBps: 500 },     // 5% - Moon
  ],

  /** Project token setup with higher liquidity concentration */
  Project: [
    { tickLower: -230400, tickUpper: -200000, positionBps: 500 },   // 5% - Floor
    { tickLower: -200000, tickUpper: -160000, positionBps: 2500 },  // 25% - Lower Mid
    { tickLower: -160000, tickUpper: -120000, positionBps: 4000 },  // 40% - Core
    { tickLower: -120000, tickUpper: -100000, positionBps: 2000 },  // 20% - Upper Mid
    { tickLower: -100000, tickUpper: -80000, positionBps: 1000 },   // 10% - Moon
  ],

  /** Legacy single full-range position (V2 style) */
  Legacy: [
    { tickLower: -887200, tickUpper: 887200, positionBps: 10000 },  // 100% - Full range
  ],
} as const

// ============================================
// Fee Configurations
// ============================================

export const FEE_CONFIGS = {
  /** Dynamic fees with MEV protection (recommended) */
  DynamicBasic: {
    type: 'dynamic' as const,
    startFee: 10000, // 100% initially
    endFee: 100,     // 1% after decay
    decayDuration: 3600, // 1 hour
  },

  /** Dynamic fees with slower decay */
  DynamicSlow: {
    type: 'dynamic' as const,
    startFee: 10000,
    endFee: 100,
    decayDuration: 86400, // 24 hours
  },

  /** Static 1% fee */
  Static1Percent: {
    type: 'static' as const,
    clankerFee: 100,
    pairedFee: 100,
  },

  /** Static 0.3% fee (Uniswap standard) */
  Static03Percent: {
    type: 'static' as const,
    clankerFee: 30,
    pairedFee: 30,
  },
} as const

// ============================================
// Vault Presets
// ============================================

export const VAULT_PRESETS = {
  /** 7-day cliff lock, 20% of supply */
  ShortLock: {
    percentage: 20,
    lockupDuration: 604800,  // 7 days
    vestingDuration: 0,      // Cliff unlock
  },

  /** 30-day lock with 90-day vesting, 30% of supply */
  MediumVest: {
    percentage: 30,
    lockupDuration: 2592000,  // 30 days
    vestingDuration: 7776000, // 90 days
  },

  /** 90-day lock with 180-day vesting, 50% of supply */
  LongVest: {
    percentage: 50,
    lockupDuration: 7776000,   // 90 days
    vestingDuration: 15552000, // 180 days
  },
} as const

// ============================================
// ABIs (Minimal for SDK operations)
// ============================================

export const V4_TOKENIZER_ABI = [
  {
    name: 'tokenizeAndDeployV4Clanker',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'params', type: 'tuple', components: [
        { name: 'name', type: 'string' },
        { name: 'symbol', type: 'string' },
        { name: 'image', type: 'string' },
        { name: 'metadata', type: 'string' },
        { name: 'context', type: 'string' },
        { name: 'tokenAdmin', type: 'address' },
        { name: 'rewards', type: 'tuple', components: [
          { name: 'recipients', type: 'tuple[]', components: [
            { name: 'recipient', type: 'address' },
            { name: 'admin', type: 'address' },
            { name: 'bps', type: 'uint16' },
            { name: 'token', type: 'uint8' },
          ]},
        ]},
        { name: 'fees', type: 'tuple', components: [
          { name: 'feeType', type: 'uint8' },
          { name: 'clankerFee', type: 'uint24' },
          { name: 'pairedFee', type: 'uint24' },
        ]},
        { name: 'vault', type: 'tuple', components: [
          { name: 'percentage', type: 'uint8' },
          { name: 'lockupDuration', type: 'uint32' },
          { name: 'vestingDuration', type: 'uint32' },
          { name: 'recipient', type: 'address' },
        ]},
        { name: 'pool', type: 'tuple', components: [
          { name: 'pairedToken', type: 'address' },
          { name: 'tickIfToken0IsClanker', type: 'int24' },
          { name: 'positions', type: 'tuple[]', components: [
            { name: 'tickLower', type: 'int24' },
            { name: 'tickUpper', type: 'int24' },
            { name: 'positionBps', type: 'uint16' },
          ]},
        ]},
        { name: 'devBuy', type: 'tuple', components: [
          { name: 'ethAmount', type: 'uint256' },
          { name: 'amountOutMin', type: 'uint256' },
        ]},
      ]},
    ],
    outputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'vaultAddress', type: 'address' },
      { name: 'sharesToken', type: 'address' },
    ],
  },
  {
    name: 'initTokenization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'clankerToken', type: 'address' },
      { name: 'rewards', type: 'tuple', components: [
        { name: 'recipients', type: 'tuple[]', components: [
          { name: 'recipient', type: 'address' },
          { name: 'admin', type: 'address' },
          { name: 'bps', type: 'uint16' },
          { name: 'token', type: 'uint8' },
        ]},
      ]},
    ],
    outputs: [
      { name: 'vaultAddress', type: 'address' },
      { name: 'pendingId', type: 'uint256' },
    ],
  },
  {
    name: 'finalizeTokenization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pendingId', type: 'uint256' },
      { name: 'clankerToken', type: 'address' },
    ],
    outputs: [
      { name: 'sharesToken', type: 'address' },
    ],
  },
] as const

export const VAULT_ABI = [
  {
    name: 'claimRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'pendingRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'clankerRewards', type: 'uint256' },
      { name: 'pairedRewards', type: 'uint256' },
    ],
  },
  {
    name: 'sharesToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'clankerToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'pairedToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const
