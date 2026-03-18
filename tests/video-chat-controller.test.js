import { describe, it, expect } from 'vitest'

import {
  syncVideoChatSession,
  prepareVideoChatRequest,
  extractChatCitations,
} from '../extension/lib/video-chat-controller.js'

describe('video chat controller', () => {
  it('resets the session when the video changes', () => {
    const current = {
      sessionKey: 'video-1::en',
      videoId: 'video-1',
      language: 'en',
      turns: [{ role: 'user', content: 'old question' }],
      memorySummary: 'old memory',
      transcriptChunks: [],
      transcriptText: 'old transcript',
      summaryDigest: 'old summary',
      citationMap: {},
    }

    const next = syncVideoChatSession(current, { videoId: 'video-2', language: 'en' })

    expect(next.sessionKey).toBe('video-2::en')
    expect(next.turns).toEqual([])
    expect(next.memorySummary).toBe('')
  })

  it('resets the session when the language changes', () => {
    const current = {
      sessionKey: 'video-1::en',
      videoId: 'video-1',
      language: 'en',
      turns: [{ role: 'user', content: 'old question' }],
      memorySummary: 'old memory',
      transcriptChunks: [],
      transcriptText: 'old transcript',
      summaryDigest: 'old summary',
      citationMap: {},
    }

    const next = syncVideoChatSession(current, { videoId: 'video-1', language: 'zh' })

    expect(next.sessionKey).toBe('video-1::zh')
    expect(next.turns).toEqual([])
  })

  it('reuses summary digest while preparing the first chat request', () => {
    const session = {
      sessionKey: 'video-1::en',
      videoId: 'video-1',
      language: 'en',
      turns: [],
      memorySummary: '',
      transcriptText: 'full transcript text',
      summaryDigest: 'Short digest from summary mode.',
      transcriptChunks: [
        { id: 'chunk-1', startSec: 0, text: 'Intro about the product.' },
        { id: 'chunk-2', startSec: 42, text: 'The speaker explains the chat workspace and follow-up questions.' },
      ],
      citationMap: {},
    }

    const result = prepareVideoChatRequest(session, {
      question: 'How does the chat workspace help with follow-up questions?',
    })

    expect(result.messages[1].content).toContain('Short digest from summary mode.')
    expect(result.selectedChunks.map((chunk) => chunk.id)).toContain('chunk-2')
    expect(result.usedFallback).toBe(false)
  })

  it('falls back to raw transcript text when chunkable transcript segments are unavailable', () => {
    const session = {
      sessionKey: 'video-1::en',
      videoId: 'video-1',
      language: 'en',
      turns: [],
      memorySummary: '',
      transcriptText: 'This video opens by introducing SpecKit and then explains how to add a reading list page.',
      summaryDigest: '',
      transcriptChunks: [],
      citationMap: {},
    }

    const result = prepareVideoChatRequest(session, {
      question: 'What is this video about?',
    })

    expect(result.messages.map((message) => message.content).join('\n')).toContain('Full transcript fallback')
    expect(result.messages.map((message) => message.content).join('\n')).toContain('introducing SpecKit')
  })

  it('prefers opening transcript chunks for first-line questions when lexical matching is weak', () => {
    const session = {
      sessionKey: 'video-1::zh',
      videoId: 'video-1',
      language: 'zh',
      turns: [],
      memorySummary: '',
      transcriptText: '第一句：欢迎来到本期教程。',
      summaryDigest: '这是一个关于 SpecKit 和 Hugo 的视频。',
      transcriptChunks: [
        { id: 'chunk-1', startSec: 0, text: '欢迎来到本期教程，我们今天要做一个阅读清单页面。' },
        { id: 'chunk-2', startSec: 36, text: '接下来我们开始搭建组件和样式。' },
        { id: 'chunk-3', startSec: 90, text: '最后总结一下这个工作流的优缺点。' },
      ],
      citationMap: {},
    }

    const result = prepareVideoChatRequest(session, {
      question: '开头第一句话是什么？',
    })

    expect(result.selectedChunks[0]?.id).toBe('chunk-1')
    expect(result.usedFallback).toBe(true)
  })

  it('prefers ending transcript chunks for ending questions when lexical matching is weak', () => {
    const session = {
      sessionKey: 'video-1::zh',
      videoId: 'video-1',
      language: 'zh',
      turns: [],
      memorySummary: '',
      transcriptText: '结尾：感谢观看。',
      summaryDigest: '这是一个关于 SpecKit 和 Hugo 的视频。',
      transcriptChunks: [
        { id: 'chunk-1', startSec: 0, text: '欢迎来到本期教程，我们今天要做一个阅读清单页面。' },
        { id: 'chunk-2', startSec: 36, text: '接下来我们开始搭建组件和样式。' },
        { id: 'chunk-3', startSec: 90, text: '感谢观看，这就是今天视频的全部内容。' },
      ],
      citationMap: {},
    }

    const result = prepareVideoChatRequest(session, {
      question: '视频结尾说了什么？',
    })

    expect(result.selectedChunks[0]?.id).toBe('chunk-3')
    expect(result.usedFallback).toBe(true)
  })

  it('extracts transcript references and approximate timestamps from assistant replies', () => {
    const citations = extractChatCitations(
      'The answer is supported by [chunk-2] and [00:42]. Another point appears at [chunk-3].',
      {
        transcriptChunks: [
          { id: 'chunk-2', startSec: 42, text: 'chat workspace details' },
          { id: 'chunk-3', startSec: 75, text: 'memory compaction details' },
        ],
      }
    )

    expect(citations).toEqual([
      { label: 'chunk-2', startSec: 42 },
      { label: '00:42', startSec: 42 },
      { label: 'chunk-3', startSec: 75 },
    ])
  })
})
