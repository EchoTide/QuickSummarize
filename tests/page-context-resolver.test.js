import { describe, it, expect, vi } from 'vitest'

import { resolveActivePageContext } from '../extension/lib/page-context-resolver.js'

describe('resolveActivePageContext', () => {
  it('returns youtube context for youtube watch pages', async () => {
    const result = await resolveActivePageContext({
      tab: { id: 1, url: 'https://www.youtube.com/watch?v=yDc0_8emz7M' },
      requestVideoInfo: vi.fn(async () => ({ videoId: 'yDc0_8emz7M', title: 'Demo video' })),
      requestPageContext: vi.fn(async () => null),
    })

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'youtube',
        videoId: 'yDc0_8emz7M',
        title: 'Demo video',
      })
    )
  })

  it('returns webpage context for supported non-youtube pages', async () => {
    const result = await resolveActivePageContext({
      tab: { id: 2, url: 'https://example.com/story' },
      requestVideoInfo: vi.fn(async () => null),
      requestPageContext: vi.fn(async () => ({
        sourceType: 'webpage',
        pageKey: 'https://example.com/story',
        title: 'Story',
        url: 'https://example.com/story',
        contentText: 'Article body',
        focusType: 'page',
        focusText: 'Article body',
      })),
    })

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'webpage',
        pageKey: 'https://example.com/story',
      })
    )
  })

  it('returns unsupported context when a page cannot be summarized', async () => {
    const result = await resolveActivePageContext({
      tab: { id: 3, url: 'chrome://extensions' },
      requestVideoInfo: vi.fn(async () => null),
      requestPageContext: vi.fn(async () => null),
    })

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'unsupported',
        error: 'UNSUPPORTED_PAGE',
      })
    )
  })
})
