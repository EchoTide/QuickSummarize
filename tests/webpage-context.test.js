import { describe, it, expect } from 'vitest'

import {
  buildWebpageContext,
  isRestrictedPageUrl,
} from '../extension/lib/webpage-context.js'

describe('buildWebpageContext', () => {
  it('prioritizes selected text over article and body text', () => {
    const result = buildWebpageContext({
      title: 'Breaking News',
      url: 'https://example.com/news/story',
      canonicalUrl: 'https://example.com/news/story',
      selectionText: 'Selected quote from the article.',
      articleText: 'Full article text that should not become the focus when a selection exists.',
      bodyText: 'Fallback page body text.',
    })

    expect(result.success).toBe(true)
    expect(result.data.sourceType).toBe('webpage')
    expect(result.data.focusType).toBe('selection')
    expect(result.data.focusText).toContain('Selected quote')
    expect(result.data.contentText).toContain('Full article text')
  })

  it('falls back from semantic article text to body text', () => {
    const result = buildWebpageContext({
      title: 'Docs page',
      url: 'https://docs.example.com/guide',
      selectionText: '',
      articleText: '',
      mainText: '',
      bodyText: 'This is the cleaned body fallback for pages without article markup.',
    })

    expect(result.success).toBe(true)
    expect(result.data.focusType).toBe('page')
    expect(result.data.contentText).toContain('cleaned body fallback')
  })

  it('returns an empty-content error when no usable page text exists', () => {
    const result = buildWebpageContext({
      title: 'Empty page',
      url: 'https://example.com/empty',
      selectionText: '',
      articleText: '',
      mainText: '',
      bodyText: ' ',
    })

    expect(result).toEqual({ success: false, error: 'EMPTY_CONTENT' })
  })
})

describe('isRestrictedPageUrl', () => {
  it('detects browser-restricted urls', () => {
    expect(isRestrictedPageUrl('chrome://extensions')).toBe(true)
    expect(isRestrictedPageUrl('about:blank')).toBe(true)
    expect(isRestrictedPageUrl('https://chromewebstore.google.com/detail/test')).toBe(true)
  })

  it('allows normal web pages', () => {
    expect(isRestrictedPageUrl('https://example.com/article')).toBe(false)
  })
})
