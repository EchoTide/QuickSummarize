import { describe, it, expect } from 'vitest'

import {
  createVideoChatAgentTools,
  defaultPlanVideoChatTurn,
  runVideoChatAgentTurn,
} from '../extension/lib/video-chat-agent.js'

function createSession() {
  return {
    sessionKey: 'video-1::zh',
    videoId: 'video-1',
    language: 'zh',
    turns: [
      { role: 'user', content: '这个视频讲什么？' },
      { role: 'assistant', content: '这是一个关于 SpecKit 的教程。' },
    ],
    memorySummary: '用户之前问过视频主题。',
    transcriptText: '欢迎来到本期教程。今天我们要用 SpecKit 给 Hugo 博客增加阅读清单页面。最后我们总结一下视觉一致性的重要性。',
    summaryDigest: '这是一个关于使用 SpecKit 为 Hugo 博客添加阅读清单功能的视频。',
    transcriptChunks: [
      { id: 'chunk-1', startSec: 0, text: '欢迎来到本期教程。今天我们要用 SpecKit 给 Hugo 博客增加阅读清单页面。' },
      { id: 'chunk-2', startSec: 38, text: '中间部分演示了如何创建组件、样式和页面结构。' },
      { id: 'chunk-3', startSec: 91, text: '最后我们总结一下视觉一致性的重要性，并回顾整个实现流程。' },
    ],
    citationMap: {},
  }
}

describe('video chat agent tools', () => {
  it('reads opening transcript chunks', async () => {
    const tools = createVideoChatAgentTools(createSession())

    const result = await tools.read_opening_chunks({ count: 1 })

    expect(result.content).toContain('欢迎来到本期教程')
    expect(result.citations).toEqual([{ label: 'chunk-1', startSec: 0 }])
  })

  it('searches transcript chunks by query', async () => {
    const tools = createVideoChatAgentTools(createSession())

    const result = await tools.search_transcript({ query: '视觉一致性', maxResults: 2 })

    expect(result.content).toContain('chunk-3')
    expect(result.citations[0]).toEqual({ label: 'chunk-3', startSec: 91 })
  })

  it('falls back to raw transcript text when requested', async () => {
    const tools = createVideoChatAgentTools(createSession())

    const result = await tools.read_full_transcript({ maxChars: 40 })

    expect(result.content).toContain('欢迎来到本期教程')
    expect(result.content.length).toBeLessThanOrEqual(80)
  })
})

describe('runVideoChatAgentTurn', () => {
  it('lets the planner choose opening transcript tools before final answer', async () => {
    const plannerCalls = []
    const planSequence = [
      { type: 'tool_call', tool: 'read_opening_chunks', args: { count: 1 } },
      { type: 'final' },
    ]

    const result = await runVideoChatAgentTurn({
      session: createSession(),
      question: '开头第一句话是什么？',
      planFn: async (input) => {
        plannerCalls.push(input)
        return planSequence.shift()
      },
      answerFn: async ({ observations }) => ({
        answer: `根据字幕，开头第一句话是：${observations[0].content}`,
        citations: observations[0].citations,
      }),
    })

    expect(plannerCalls).toHaveLength(2)
    expect(result.toolCalls).toEqual(['read_opening_chunks'])
    expect(result.answer).toContain('开头第一句话')
    expect(result.citations).toEqual([{ label: 'chunk-1', startSec: 0 }])
  })

  it('supports multi-step planning with summary then search before final answer', async () => {
    const planSequence = [
      { type: 'tool_call', tool: 'read_summary_digest', args: {} },
      { type: 'tool_call', tool: 'search_transcript', args: { query: '视觉一致性', maxResults: 1 } },
      { type: 'final' },
    ]

    const result = await runVideoChatAgentTurn({
      session: createSession(),
      question: '视频最后总结了什么？',
      planFn: async () => planSequence.shift(),
      answerFn: async ({ observations }) => ({
        answer: observations.map((item) => item.content).join('\n'),
        citations: observations.flatMap((item) => item.citations || []),
      }),
    })

    expect(result.toolCalls).toEqual(['read_summary_digest', 'search_transcript'])
    expect(result.answer).toContain('SpecKit')
    expect(result.answer).toContain('视觉一致性')
    expect(result.citations).toContainEqual({ label: 'chunk-3', startSec: 91 })
  })

  it('forces transcript evidence before final answer when planner stops too early', async () => {
    const planSequence = [
      { type: 'tool_call', tool: 'read_summary_digest', args: {} },
      { type: 'final' },
    ]

    const result = await runVideoChatAgentTurn({
      session: {
        ...createSession(),
        summaryDigest: '',
      },
      question: '这个视频讲了什么？',
      planFn: async () => planSequence.shift(),
      answerFn: async ({ observations }) => ({
        answer: observations.map((item) => `${item.tool}: ${item.content}`).join('\n'),
        citations: observations.flatMap((item) => item.citations || []),
      }),
    })

    expect(result.toolCalls).toContain('read_summary_digest')
    expect(result.toolCalls).toContain('search_transcript')
    expect(result.answer).toContain('SpecKit')
    expect(result.citations.length).toBeGreaterThan(0)
  })

  it('falls back to full transcript when search returns no evidence', async () => {
    const sparseSession = {
      ...createSession(),
      transcriptChunks: [],
      transcriptText: '欢迎来到本期教程。今天我们要用 SpecKit 给 Hugo 博客增加阅读清单页面。',
      summaryDigest: '',
    }
    const planSequence = [{ type: 'final' }]

    const result = await runVideoChatAgentTurn({
      session: sparseSession,
      question: '这个视频讲了什么？',
      planFn: async () => planSequence.shift(),
      answerFn: async ({ observations }) => ({
        answer: observations.map((item) => item.content).join('\n'),
        citations: observations.flatMap((item) => item.citations || []),
      }),
    })

    expect(result.toolCalls).toContain('read_full_transcript')
    expect(result.answer).toContain('欢迎来到本期教程')
  })
})

describe('defaultPlanVideoChatTurn', () => {
  it('uses transcript-first instructions instead of summary-first behavior', async () => {
    let capturedMessages = []

    await defaultPlanVideoChatTurn({
      config: {},
      session: createSession(),
      question: '这个视频讲了什么？',
      completeFn: async (_config, messages) => {
        capturedMessages = messages
        return '{"type":"final"}'
      },
    })

    expect(capturedMessages[0].content).toContain('Treat the transcript as the primary source of truth')
    expect(capturedMessages[0].content).toContain('Do not rely on summary digest first')
  })

  it('includes summary digest only after transcript evidence already exists', async () => {
    let capturedMessages = []

    await defaultPlanVideoChatTurn({
      config: {},
      session: createSession(),
      question: '视频最后总结了什么？',
      observations: [
        {
          tool: 'search_transcript',
          content: '[chunk-3 @ 91s] 最后我们总结一下视觉一致性的重要性，并回顾整个实现流程。',
          citations: [{ label: 'chunk-3', startSec: 91 }],
        },
      ],
      completeFn: async (_config, messages) => {
        capturedMessages = messages
        return '{"type":"final"}'
      },
    })

    expect(capturedMessages.map((message) => message.content).join('\n')).toContain('search_transcript')
    expect(capturedMessages.map((message) => message.content).join('\n')).toContain('视觉一致性')
  })
})
