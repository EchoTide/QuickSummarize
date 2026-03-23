import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('x tweet translation wiring', () => {
  it('installs tweet-level translation controls in the generic webpage content script', () => {
    const webpageContentJs = readFileSync(resolve(process.cwd(), 'extension/webpage-content.js'), 'utf8')

    expect(webpageContentJs).toContain("import { installXTweetTranslation } from './lib/x-tweet-translate.js'")
    expect(webpageContentJs).toContain('installXTweetTranslation({ loadConfig })')
  })

  it('builds x timeline translation UI from the existing DeepL flow', () => {
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/x-tweet-translate.js'), 'utf8')

    expect(source).toContain("translateSelectionText(text, {")
    expect(source).toContain("window.location.hostname === 'x.com'")
    expect(source).toContain("window.location.hostname === 'twitter.com'")
    expect(source).toContain("[data-testid=\"tweetText\"]")
    expect(source).toContain("dataset.role = 'tweet-translate'")
    expect(source).toContain("translation.dataset.state = 'done'")
  })

  it('styles the control like a native secondary action and keeps translation text readable', () => {
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/x-tweet-translate.js'), 'utf8')

    expect(source).toContain("button.style.background = 'transparent'")
    expect(source).toContain("button.style.color = 'rgb(29, 155, 240)'")
    expect(source).toContain("button.style.font = \"600 13px 'Segoe UI', 'Noto Sans SC', sans-serif\"")
    expect(source).toContain('const palette = getTranslationPalette()')
    expect(source).toContain('container.style.background = palette.background')
    expect(source).toContain('container.style.color = palette.text')
    expect(source).toContain('label.style.color = palette.label')
  })

  it('uses a stronger light-mode translation palette without changing dark mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/x-tweet-translate.js'), 'utf8')

    expect(source).toContain('window.matchMedia?.(\'(prefers-color-scheme: dark)\')?.matches')
    expect(source).toContain("background: 'rgba(15, 20, 25, 0.03)'")
    expect(source).toContain("border: '1px solid rgba(15, 20, 25, 0.12)'")
    expect(source).toContain("text: 'rgb(15, 20, 25)'")
    expect(source).toContain("label: 'rgb(83, 100, 113)'")
    expect(source).toContain("background: 'rgba(255, 255, 255, 0.03)'")
    expect(source).toContain("text: 'rgb(231, 233, 234)'")
  })

  it('keeps the translation container fully collapsed before the first click', () => {
    const source = readFileSync(resolve(process.cwd(), 'extension/lib/x-tweet-translate.js'), 'utf8')

    expect(source).toContain('let translation = null')
    expect(source).toContain('let body = null')
    expect(source).toContain('if (!translation) {')
    expect(source).not.toContain("translation.hidden = true")
  })
})
