import { describe, it, expect } from 'vitest'
import { hasVideoChanged, normalizeVideoInfo } from '../extension/lib/video-sync.js'

describe('normalizeVideoInfo', () => {
  it('normalizes missing fields to empty strings', () => {
    expect(normalizeVideoInfo(null)).toEqual({ videoId: '', title: '' })
    expect(normalizeVideoInfo({})).toEqual({ videoId: '', title: '' })
  })

  it('normalizes non-string values', () => {
    expect(normalizeVideoInfo({ videoId: 123, title: ['x'] })).toEqual({
      videoId: '123',
      title: 'x',
    })
  })
})

describe('hasVideoChanged', () => {
  it('returns true when video id changes', () => {
    expect(hasVideoChanged({ videoId: 'old' }, { videoId: 'new' })).toBe(true)
  })

  it('returns false when video id stays the same', () => {
    expect(hasVideoChanged({ videoId: 'same' }, { videoId: 'same' })).toBe(false)
  })

  it('returns true when previous id is empty and next id exists', () => {
    expect(hasVideoChanged({ videoId: '' }, { videoId: 'new' })).toBe(true)
  })
})
