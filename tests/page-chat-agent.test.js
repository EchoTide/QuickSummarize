import { describe, it, expect, vi } from 'vitest'

import { runPageChatAgentTurn } from '../extension/lib/page-chat-agent.js'

describe('runPageChatAgentTurn', () => {
  it('grounds the answer in relevant page chunks and returns snippet citations', async () => {
    const chunksSeen = []

    const result = await runPageChatAgentTurn({
      config: { baseUrl: 'https://example.com', apiKey: 'key', model: 'test-model' },
      session: {
        language: 'en',
        contentText: [
          'QuickSummarize adds webpage mode.',
          'Selected text is prioritized for the initial chat context.',
          'Timeline and timestamps stay YouTube-only.',
        ].join(' '),
        pageChunks: [
          { id: 'page-1', index: 0, text: 'QuickSummarize adds webpage mode.' },
          { id: 'page-2', index: 1, text: 'Selected text is prioritized for the initial chat context.' },
          { id: 'page-3', index: 2, text: 'Timeline and timestamps stay YouTube-only.' },
        ],
        focusText: 'Selected text is prioritized',
        summaryDigest: 'Webpage mode overview.',
        memorySummary: 'Earlier the user asked about launch entry points.',
        turns: [],
      },
      question: 'Does webpage chat use timestamps?',
      streamReply: vi.fn(async (_config, messages, onChunk) => {
        const helper = messages.find((message) => message.role === 'system' && message.content.includes('Page context:'))
        chunksSeen.push(helper?.content || '')
        onChunk('No. ')
        onChunk('Webpage chat stays grounded in page snippets instead of timestamps.')
      }),
    })

    expect(result.answer).toContain('instead of timestamps')
    expect(result.citations).toHaveLength(2)
    expect(result.citations[0].label).toBe('page-2')
    expect(chunksSeen.join('\n')).toContain('Selected text is prioritized')
  })
})
