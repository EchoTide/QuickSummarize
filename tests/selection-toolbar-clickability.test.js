import { describe, it, expect } from 'vitest'

describe('selection toolbar clickability contract', () => {
  it('does not block button clicks by preventing default on toolbar mousedown', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/selection-translate.js'), 'utf8')

    expect(source).not.toContain("toolbar.addEventListener('mousedown'")
    expect(source).toContain("translateButton?.addEventListener('click'")
  })
})
