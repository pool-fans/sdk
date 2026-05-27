import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

function sectionBetween(markdown: string, startHeading: string, nextHeadingLevel: string): string {
  const start = markdown.indexOf(startHeading)
  expect(start, `${startHeading} should exist`).toBeGreaterThanOrEqual(0)

  const rest = markdown.slice(start + startHeading.length)
  const next = rest.search(new RegExp(`\\n${nextHeadingLevel} `))
  return next === -1 ? rest : rest.slice(0, next)
}

function firstCodeBlock(markdown: string): string {
  const match = markdown.match(/```(?:typescript|ts)\n([\s\S]*?)```/)
  expect(match, 'expected a TypeScript code block').not.toBeNull()
  return match?.[1] ?? ''
}

describe('README quickstart safety', () => {
  const quickStart = sectionBetween(readme, '## Quick Start', '##')

  it('starts with a read-only Base quickstart before wallet-write examples', () => {
    expect(quickStart).toContain('### Read-only quickstart')
    expect(quickStart).toContain('### Wallet-write deployment')
    expect(quickStart.indexOf('### Read-only quickstart')).toBeLessThan(
      quickStart.indexOf('### Wallet-write deployment')
    )

    const readOnlyExample = firstCodeBlock(quickStart)
    expect(readOnlyExample).toContain("createPublicClient")
    expect(readOnlyExample).toContain('base')
    expect(readOnlyExample).not.toContain('privateKeyToAccount')
    expect(readOnlyExample).not.toContain('createWalletClient')
    expect(readOnlyExample).not.toContain('deployWithTokenizedFees')
  })

  it('states no-broadcast defaults and financial-data caveats', () => {
    const requiredNeedles = [
      'no-broadcast',
      'Base mainnet',
      'wallet-confirmed',
      'private key',
      'indexed/read-only',
      'not live claimable balances',
      'no yield or APR promise',
    ]

    for (const needle of requiredNeedles) {
      expect(readme.toLowerCase()).toContain(needle.toLowerCase())
    }
  })
})
