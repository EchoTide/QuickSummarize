import { describe, it, expect } from 'vitest'

describe('selection toolbar design contract', () => {
  it('uses pointer-triggered translate button instead of runtime message listener flow', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/selection-translate.js'), 'utf8')

    expect(source).toContain('selection-toolbar')
    expect(source).toContain('Translate')
    expect(source).toContain('QuickSummarize')
    expect(source).toContain("dataset.role = 'brand'")
    expect(source).not.toContain('chrome.runtime.onMessage.addListener')
  })
})
