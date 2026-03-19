import { describe, it, expect } from 'vitest'

describe('selection toolbar behavior contract', () => {
  it('localizes the visible translate button label', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/selection-translate.js'), 'utf8')

    expect(source).not.toContain("button.textContent = 'Translate'")
    expect(source).toContain('button.textContent = textTable.translate')
  })

  it('invokes translation from the toolbar click path', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/selection-translate.js'), 'utf8')

    expect(source).toContain("translateButton?.addEventListener('click'")
    expect(source).toContain('void onTranslate()')
  })
})
