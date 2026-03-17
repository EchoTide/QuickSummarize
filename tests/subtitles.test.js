import { describe, it, expect } from 'vitest'
import { mergeSubtitleSegments, buildSrtContent } from '../extension/lib/subtitles.js'

describe('mergeSubtitleSegments', () => {
  it('merges short consecutive segments into 10-second chunks', () => {
    const merged = mergeSubtitleSegments([
      { startSec: 1, text: 'A' },
      { startSec: 2.2, text: 'B' },
      { startSec: 4.8, text: 'C' },
      { startSec: 12.5, text: 'D' },
    ])

    expect(merged).toEqual([
      { startSec: 1, text: 'A B C' },
      { startSec: 12.5, text: 'D' },
    ])
  })

  it('starts a new chunk when span exceeds merge window', () => {
    const merged = mergeSubtitleSegments(
      [
        { startSec: 0, text: 'line 1' },
        { startSec: 9.9, text: 'line 2' },
        { startSec: 10.1, text: 'line 3' },
      ],
      10
    )

    expect(merged).toEqual([
      { startSec: 0, text: 'line 1 line 2' },
      { startSec: 10.1, text: 'line 3' },
    ])
  })
})

describe('buildSrtContent', () => {
  it('builds SRT blocks from timestamped subtitle segments', () => {
    const srt = buildSrtContent([
      { startSec: 1.25, text: 'Hello' },
      { startSec: 4, text: 'world' },
      { startSec: 7.5, text: 'done' },
    ])

    expect(srt).toBe([
      '1',
      '00:00:01,250 --> 00:00:04,000',
      'Hello',
      '',
      '2',
      '00:00:04,000 --> 00:00:07,500',
      'world',
      '',
      '3',
      '00:00:07,500 --> 00:00:09,500',
      'done',
    ].join('\n'))
  })

  it('skips empty rows and uses a fallback duration for invalid next timestamps', () => {
    const srt = buildSrtContent([
      { startSec: 3, text: 'first' },
      { startSec: 3, text: 'second' },
      { startSec: 6, text: '   ' },
    ])

    expect(srt).toBe([
      '1',
      '00:00:03,000 --> 00:00:05,000',
      'first',
      '',
      '2',
      '00:00:03,000 --> 00:00:05,000',
      'second',
    ].join('\n'))
  })
})
