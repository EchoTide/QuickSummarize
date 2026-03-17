import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const optionsHtml = readFileSync(resolve(process.cwd(), 'extension/options.html'), 'utf8')

describe('options caption automation setting', () => {
  it('includes an auto-open captions checkbox', () => {
    expect(optionsHtml).toMatch(/id="autoOpenCaptions"/)
  })

  it('includes a visible risk note for automation', () => {
    expect(optionsHtml).toMatch(/risk-note|risk-note-text|automation/i)
  })
})
