import { describe, it, expect } from 'vitest'
import { extractVideoIdFromUrl, isYouTubeVideoUrl } from '../extension/lib/video-page.js'

describe('isYouTubeVideoUrl', () => {
  it('returns true for watch URLs with v parameter', () => {
    expect(isYouTubeVideoUrl('https://www.youtube.com/watch?v=yDc0_8emz7M')).toBe(true)
  })

  it('returns true for shorts URLs', () => {
    expect(isYouTubeVideoUrl('https://www.youtube.com/shorts/yDc0_8emz7M')).toBe(true)
  })

  it('returns false for non-video YouTube URLs', () => {
    expect(isYouTubeVideoUrl('https://www.youtube.com/results?search_query=test')).toBe(false)
  })
})

describe('extractVideoIdFromUrl', () => {
  it('extracts video id from watch URL', () => {
    expect(extractVideoIdFromUrl('https://www.youtube.com/watch?v=yDc0_8emz7M')).toBe(
      'yDc0_8emz7M'
    )
  })

  it('extracts video id from shorts URL', () => {
    expect(extractVideoIdFromUrl('https://www.youtube.com/shorts/yDc0_8emz7M?feature=share')).toBe(
      'yDc0_8emz7M'
    )
  })

  it('returns empty string for non-video URL', () => {
    expect(extractVideoIdFromUrl('https://www.youtube.com/')).toBe('')
  })
})
