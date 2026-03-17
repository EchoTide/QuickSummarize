import { describe, it, expect } from 'vitest'
import { normalizeLanguage, nextLanguage, getLanguageToggleLabel } from '../extension/lib/i18n.js'

describe('i18n helpers', () => {
  it('normalizes unknown language to english', () => {
    expect(normalizeLanguage('fr')).toBe('en')
    expect(normalizeLanguage(undefined)).toBe('en')
  })

  it('keeps supported languages', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('zh')).toBe('zh')
  })

  it('switches to the next language', () => {
    expect(nextLanguage('en')).toBe('zh')
    expect(nextLanguage('zh')).toBe('en')
  })

  it('returns toggle label as the target language', () => {
    expect(getLanguageToggleLabel('en')).toBe('ZH')
    expect(getLanguageToggleLabel('zh')).toBe('EN')
  })
})
