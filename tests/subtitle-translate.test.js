import { describe, it, expect } from 'vitest'
import {
  shouldTranslateSubtitles,
  chunkMergedSubtitles,
  translateMergedSubtitles,
} from '../extension/lib/subtitle-translate.js'

describe('shouldTranslateSubtitles', () => {
  it('returns true for english-like text when target is zh', () => {
    const segments = [{ startSec: 0, text: 'This is a test subtitle line.' }]
    expect(shouldTranslateSubtitles(segments, 'zh')).toBe(true)
  })

  it('returns true for cjk text when target is en', () => {
    const segments = [{ startSec: 0, text: '这是一个测试字幕。' }]
    expect(shouldTranslateSubtitles(segments, 'en')).toBe(true)
  })

  it('returns false when script already matches target language', () => {
    expect(shouldTranslateSubtitles([{ startSec: 0, text: '这是中文' }], 'zh')).toBe(false)
    expect(shouldTranslateSubtitles([{ startSec: 0, text: 'English text' }], 'en')).toBe(false)
  })
})

describe('chunkMergedSubtitles', () => {
  it('splits merged segments into bounded chunks preserving index', () => {
    const input = [
      { startSec: 0, text: 'a'.repeat(20) },
      { startSec: 11, text: 'b'.repeat(20) },
      { startSec: 22, text: 'c'.repeat(20) },
    ]

    const chunks = chunkMergedSubtitles(input, { maxItems: 2, maxChars: 200 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0].map((row) => row.index)).toEqual([0, 1])
    expect(chunks[1].map((row) => row.index)).toEqual([2])
  })
})

describe('translateMergedSubtitles', () => {
  it('translates chunk output and maps result to original order', async () => {
    const merged = [
      { startSec: 0, text: 'Hello world' },
      { startSec: 12, text: 'How are you' },
    ]

    const translated = await translateMergedSubtitles(
      { model: 'x' },
      merged,
      'zh',
      async ({ inputItems }) => {
        return inputItems.map((item) => ({
          index: item.index,
          text: `${item.text}-zh`,
        }))
      }
    )

    expect(translated).toEqual([
      { startSec: 0, text: 'Hello world-zh' },
      { startSec: 12, text: 'How are you-zh' },
    ])
  })
})
