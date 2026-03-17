import { describe, it, expect, vi } from 'vitest'
import { fetchTranscriptForVideo } from '../extension/lib/transcript-source.js'

describe('fetchTranscriptForVideo', () => {
  it('falls back to direct transcript fetch when page warmup finds no cached captions', async () => {
    const getCachedTranscript = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        text: 'Hello world',
        segments: [{ startSec: 0, text: 'Hello world' }],
      })
    const runTimedtextPrefetch = vi.fn(async () => {})
    const waitForTimedtextActivity = vi.fn(async () => {})

    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript,
      runTimedtextPrefetch,
      waitForTimedtextActivity,
      getRecentTimedtextUrls: vi.fn(() => ['https://www.youtube.com/api/timedtext?v=abc&lang=en']),
    })

    expect(result).toEqual({
      success: true,
      text: 'Hello world',
      segments: [{ startSec: 0, text: 'Hello world' }],
    })
  })

  it('returns cached transcript before using direct fetch fallback', async () => {
    const cached = {
      text: 'cached transcript',
      segments: [{ startSec: 1, text: 'cached transcript' }],
    }

    const result = await fetchTranscriptForVideo('abc', 'en', {
      getCachedTranscript: vi.fn(() => cached),
      runTimedtextPrefetch: vi.fn(async () => {}),
      waitForTimedtextActivity: vi.fn(async () => {}),
      getRecentTimedtextUrls: vi.fn(() => []),
      fetchTranscriptByVideoId: vi.fn(async () => ({ success: false, error: 'NO_CAPTIONS' })),
      preferredLanguages: ['en'],
    })

    expect(result).toEqual({
      success: true,
      text: 'cached transcript',
      segments: [{ startSec: 1, text: 'cached transcript' }],
    })
  })

  it('requires manual captions when auto-open is disabled and no caption activity exists', async () => {
    const runTimedtextPrefetch = vi.fn(async () => {})

    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript: vi.fn(() => null),
      runTimedtextPrefetch,
      waitForTimedtextActivity: vi.fn(async () => {}),
      getRecentTimedtextUrls: vi.fn(() => []),
      allowAutomation: false,
    })

    expect(result).toEqual({ success: false, error: 'MANUAL_CAPTIONS_REQUIRED' })
    expect(runTimedtextPrefetch).not.toHaveBeenCalled()
  })

  it('does not actively fetch transcript urls when automation is disabled and cache is empty', async () => {
    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript: vi.fn(() => null),
      runTimedtextPrefetch: vi.fn(async () => {}),
      waitForTimedtextActivity: vi.fn(async () => {}),
      getRecentTimedtextUrls: vi.fn(() => ['https://www.youtube.com/api/timedtext?v=abc&lang=en']),
      allowAutomation: false,
    })

    expect(result).toEqual({ success: false, error: 'MANUAL_CAPTIONS_REQUIRED' })
  })
})
