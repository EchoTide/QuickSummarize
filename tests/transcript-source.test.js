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

  it('does not require manual captions when timedtext activity already exists', async () => {
    const getCachedTranscript = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        text: 'Observed captions',
        segments: [{ startSec: 0, text: 'Observed captions' }],
      })

    const waitForTimedtextActivity = vi.fn(async () => ({ hit: 'seed-url' }))

    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript,
      runTimedtextPrefetch: vi.fn(async () => {}),
      waitForTimedtextActivity,
      getRecentTimedtextUrls: vi.fn(() => ['https://www.youtube.com/api/timedtext?v=abc&lang=zh']),
      allowAutomation: false,
    })

    expect(result).toEqual({
      success: true,
      text: 'Observed captions',
      segments: [{ startSec: 0, text: 'Observed captions' }],
    })
    expect(waitForTimedtextActivity).toHaveBeenCalledWith('abc', 2200, 160)
  })

  it('reports no captions instead of manual captions when timedtext activity exists but cache stays empty', async () => {
    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript: vi.fn(() => null),
      runTimedtextPrefetch: vi.fn(async () => {}),
      waitForTimedtextActivity: vi.fn(async () => {}),
      getRecentTimedtextUrls: vi.fn(() => ['https://www.youtube.com/api/timedtext?v=abc&lang=en']),
      allowAutomation: false,
    })

    expect(result).toEqual({ success: false, error: 'NO_CAPTIONS' })
  })

  it('falls back to fetching transcript from observed caption track urls when cache is empty', async () => {
    const fetchTranscriptByTrackUrl = vi.fn(async (urls) => {
      expect(urls).toEqual([
        'https://www.youtube.com/api/timedtext?v=abc&lang=zh',
        'https://www.youtube.com/api/timedtext?v=abc&lang=en',
      ])

      return {
        success: true,
        text: 'Recovered from track url',
        segments: [{ startSec: 0, text: 'Recovered from track url' }],
      }
    })

    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript: vi.fn(() => null),
      runTimedtextPrefetch: vi.fn(async () => {}),
      waitForTimedtextActivity: vi.fn(async () => ({ hit: 'seed-url' })),
      getRecentTimedtextUrls: vi.fn(() => [
        'https://www.youtube.com/api/timedtext?v=abc&lang=zh',
        'https://www.youtube.com/api/timedtext?v=abc&lang=en',
      ]),
      fetchTranscriptByTrackUrl,
      allowAutomation: false,
    })

    expect(result).toEqual({
      success: true,
      text: 'Recovered from track url',
      segments: [{ startSec: 0, text: 'Recovered from track url' }],
    })
    expect(fetchTranscriptByTrackUrl).toHaveBeenCalledTimes(1)
  })

  it('waits for late timedtext activity before requiring manual captions when automation is disabled', async () => {
    const getCachedTranscript = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        text: 'Late captions',
        segments: [{ startSec: 0, text: 'Late captions' }],
      })

    const result = await fetchTranscriptForVideo('abc', 'zh', {
      getCachedTranscript,
      runTimedtextPrefetch: vi.fn(async () => {}),
      waitForTimedtextActivity: vi.fn(async () => ({ hit: 'late-url' })),
      getRecentTimedtextUrls: vi.fn(() => []),
      allowAutomation: false,
    })

    expect(result).toEqual({
      success: true,
      text: 'Late captions',
      segments: [{ startSec: 0, text: 'Late captions' }],
    })
  })
})
