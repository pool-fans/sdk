# PoolFans SDK — Claude Configuration

## Project Overview
- **Name:** @poolfans/sdk
- **Version:** 0.2.0
- **Type:** TypeScript SDK for deploying Clanker tokens with tokenized fee rewards via PoolFans
- **Stack:** TypeScript, viem, vitest
- **Chain:** Base Mainnet

## Architecture

```
src/
├── index.ts              # Main entry point — re-exports everything
├── PoolFansTokenizer.ts  # Core tokenizer class
├── constants.ts          # Addresses, chain IDs, config constants
├── types.ts              # All TypeScript types/interfaces
└── v4/                   # V4-specific implementations
    └── index.ts          # V4 exports

dist/                     # Built output (ESM + CJS)
├── index.js              # CJS bundle
├── index.mjs             # ESM bundle
└── index.d.ts            # Type declarations
```

## Exports
```json
{
  ".": "dist/index",
  "./v4": "dist/v4/index"
}
```

## Coding Conventions

### TypeScript
- Strict mode, no `any`
- All public API functions must have explicit types
- Export all types from `src/types.ts` and re-export through `src/index.ts`
- Use viem's `Address`, `Hash`, `Hex` types — never raw strings for addresses

### SDK Design Principles
- **Minimal surface area** — only export what users need
- **Type safety first** — consumers get full IntelliSense
- **No side effects** — pure functions where possible
- **Explicit error handling** — throw typed errors, never swallow
- **viem over ethers** — use viem primitives for all chain types

### Module Pattern
```typescript
// src/index.ts — barrel export
export { PoolFansTokenizer } from "./PoolFansTokenizer"
export type { TokenizerConfig, DeployParams } from "./types"
export * from "./constants"
```

### Class Pattern
```typescript
import { createPublicClient, createWalletClient } from "viem"
import type { Address, Hash } from "viem"

export class PoolFansTokenizer {
  constructor(private readonly config: TokenizerConfig) {}

  async deploy(params: DeployParams): Promise<Hash> {
    // Always validate inputs
    // Always simulate before sending
    // Return typed results
  }
}
```

## Commands

### Development
```bash
npm run build     # Build ESM + CJS to dist/
npm test          # Run vitest tests
npm run lint      # TypeScript + ESLint
```

### Before Publishing
1. `npm run build` — verify clean build
2. `npm test` — all tests pass
3. Bump version in package.json
4. Verify exports in dist/ match package.json exports map

## Quality Standards

### Before Commits
1. Build succeeds — no TS errors
2. All tests pass
3. Public API surface reviewed for breaking changes
4. Types exported for all public interfaces

### SDK Checklist
- [ ] No `any` types in public API
- [ ] All params have TypeScript interfaces
- [ ] Breaking changes bumped major version
- [ ] viem types used for all chain primitives
- [ ] Constants use `as const` for narrow typing

## Agents Available
- `architect` — design approach before coding
- `orchestrator` — complex multi-step tasks
- `sdk-developer` — SDK-specific patterns and library design
- `code-reviewer` — quality review
- `test-engineer` — test coverage
