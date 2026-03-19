import { describe, it, expect } from 'vitest'

describe('content message listener safety', () => {
  it('handles transcript and caption requests without bare then(sendResponse) chains', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const contentJs = readFileSync(resolve(process.cwd(), 'extension/content.js'), 'utf8')

    expect(contentJs).not.toContain('fetchOriginalTranscript(message.language).then(sendResponse)')
    expect(contentJs).not.toContain('fetchTranscript(message.language).then(sendResponse)')
    expect(contentJs).not.toContain('switchCaptionLanguageOnPage(message.language).then(sendResponse)')
  })
})
