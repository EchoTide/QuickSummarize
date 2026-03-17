import { describe, it, expect } from 'vitest'
import { buildTimelineChunks, summarizeTimelineChunks } from '../extension/lib/timeline-summary.js'

describe('buildTimelineChunks', () => {
  it('groups merged segments by timeline window', () => {
    const chunks = buildTimelineChunks(
      [
        { startSec: 2, text: 'intro part' },
        { startSec: 40, text: 'more intro' },
        { startSec: 125, text: 'topic two begins' },
      ],
      { windowSec: 90, maxChars: 500 }
    )

    expect(chunks).toEqual([
      { startSec: 2, text: 'intro part more intro' },
      { startSec: 125, text: 'topic two begins' },
    ])
  })
})

describe('summarizeTimelineChunks', () => {
  it('summarizes merged segments in one llm request with requested language', async () => {
    const segments = [
      { startSec: 0, text: 'a'.repeat(80) },
      { startSec: 120, text: 'b'.repeat(90) },
    ]

    const calls = []

    const output = await summarizeTimelineChunks(
      { model: 'x' },
      segments,
      'zh',
      async (_config, messages) => {
        calls.push(messages)
        return JSON.stringify([
          { startSec: 0, text: '第一段总结' },
          { startSec: 120, text: '第二段总结' },
        ])
      }
    )

    expect(calls).toHaveLength(1)
    expect(String(calls[0]?.[1]?.content || '')).toContain('最多')
    expect(output).toEqual([
      { startSec: 0, text: '第一段总结' },
      { startSec: 120, text: '第二段总结' },
    ])
  })

  it('parses timestamp format and fenced json response', async () => {
    const segments = [
      { startSec: 5, text: 'intro' },
      { startSec: 88, text: 'details' },
    ]

    const output = await summarizeTimelineChunks(
      { model: 'x' },
      segments,
      'en',
      async (_config, messages) => {
        const prompt = String(messages?.[1]?.content || '')
        expect(prompt).toContain('translate every output item')
        expect(prompt).toContain('Avoid vague labels like "intro"')
        return '```json\n[{"time":"00:05","summary":"Intro"},{"time":"01:28","summary":"Details"}]\n```'
      }
    )

    expect(output).toEqual([
      { startSec: 5, text: 'Intro' },
      { startSec: 88, text: 'Details' },
    ])
  })

  it('falls back to deterministic local timeline when llm output is invalid', async () => {
    const segments = [
      { startSec: 0, text: 'first section details here.' },
      { startSec: 20, text: 'more text in first section.' },
      { startSec: 150, text: 'second section details here.' },
    ]

    const output = await summarizeTimelineChunks(
      { model: 'x' },
      segments,
      'en',
      async () => 'not-json'
    )

    expect(output.length).toBeGreaterThan(0)
    expect(output[0].startSec).toBe(0)
    expect(output[0].text.length).toBeGreaterThan(0)
  })

  it('throws when llm request fails instead of silently falling back', async () => {
    await expect(
      summarizeTimelineChunks(
        { model: 'x' },
        [{ startSec: 0, text: 'intro section' }],
        'en',
        async () => {
          throw new Error('HTTP 401')
        }
      )
    ).rejects.toThrow('HTTP 401')
  })

  it('uses transcript text fallback when segments are empty', async () => {
    const calls = []

    const output = await summarizeTimelineChunks(
      { model: 'x' },
      [],
      'en',
      async (_config, messages) => {
        calls.push(messages)
        return JSON.stringify([{ startSec: 0, text: 'Whole video summary' }])
      },
      undefined,
      'full transcript without timestamps'
    )

    expect(calls).toHaveLength(1)
    expect(output).toEqual([{ startSec: 0, text: 'Whole video summary' }])
  })

  it('splits oversized transcript into sequential batches and merges outputs', async () => {
    const segments = Array.from({ length: 180 }, (_, index) => ({
      startSec: index * 10,
      text: `segment-${index} `.repeat(20),
    }))

    let callIndex = 0
    const output = await summarizeTimelineChunks(
      { model: 'x' },
      segments,
      'en',
      async () => {
        callIndex += 1
        const base = (callIndex - 1) * 1000
        return JSON.stringify([
          { startSec: base, text: `Batch ${callIndex} start` },
          { startSec: base + 100, text: `Batch ${callIndex} end` },
        ])
      }
    )

    expect(callIndex).toBeGreaterThan(1)
    expect(output.length).toBe(callIndex * 2)
    expect(output[0]).toEqual({ startSec: 0, text: 'Batch 1 start' })
    expect(output[output.length - 1].text).toBe(`Batch ${callIndex} end`)
  })

  it('emits progressive batch updates while processing timeline', async () => {
    const segments = Array.from({ length: 140 }, (_, index) => ({
      startSec: index * 10,
      text: `part-${index} `.repeat(18),
    }))

    const progressSteps = []

    await summarizeTimelineChunks(
      { model: 'x' },
      segments,
      'en',
      async () => JSON.stringify([{ startSec: 0, text: 'ok' }]),
      undefined,
      '',
      (progress) => progressSteps.push(progress)
    )

    expect(progressSteps.length).toBeGreaterThan(1)
    expect(progressSteps[0].completedBatches).toBe(1)
    expect(progressSteps[progressSteps.length - 1].completedBatches).toBe(
      progressSteps[progressSteps.length - 1].totalBatches
    )
  })

  it('retries once with language correction when english output is chinese', async () => {
    let callCount = 0

    const output = await summarizeTimelineChunks(
      { model: 'x' },
      [{ startSec: 0, text: '中文原文字幕' }],
      'en',
      async (_config, messages) => {
        callCount += 1
        if (callCount === 1) {
          return JSON.stringify([{ startSec: 0, text: '这是中文总结' }])
        }

        expect(String(messages?.[1]?.content || '')).toContain('Critical correction')
        return JSON.stringify([{ startSec: 0, text: 'This is an English summary.' }])
      }
    )

    expect(callCount).toBe(2)
    expect(output).toEqual([{ startSec: 0, text: 'This is an English summary.' }])
  })

  it('retries once when timeline output is too generic', async () => {
    let callCount = 0

    const output = await summarizeTimelineChunks(
      { model: 'x' },
      [
        { startSec: 0, text: '这段视频会讲 Skill Creator 的三件事，包括入口、配置方式和调试方法。' },
        { startSec: 90, text: '首先演示如何在 Claude 中打开技能创建器，然后讲目录结构。' },
      ],
      'zh',
      async (_config, messages) => {
        callCount += 1
        if (callCount === 1) {
          return JSON.stringify([
            { startSec: 0, text: '开场介绍' },
            { startSec: 90, text: '三件事' },
          ])
        }

        expect(String(messages?.[1]?.content || '')).toContain('output is too generic')
        return JSON.stringify([
          { startSec: 0, text: '说明 Skill Creator 的用途与整体流程' },
          { startSec: 90, text: '演示入口位置、目录结构与调试方法' },
        ])
      }
    )

    expect(callCount).toBe(2)
    expect(output).toEqual([
      { startSec: 0, text: '说明 Skill Creator 的用途与整体流程' },
      { startSec: 90, text: '演示入口位置、目录结构与调试方法' },
    ])
  })

  it('requests more timeline items for dense short transcripts', async () => {
    const segments = Array.from({ length: 45 }, (_, index) => ({
      startSec: index * 6,
      text: `skill creator step ${index} setup example debug workflow`,
    }))

    await summarizeTimelineChunks(
      { model: 'x' },
      segments,
      'zh',
      async (_config, messages) => {
        const prompt = String(messages?.[1]?.content || '')
        expect(prompt).toContain('最多 6 条')
        return JSON.stringify([{ startSec: 0, text: '测试' }])
      }
    )
  })
})
