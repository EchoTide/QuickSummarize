import { describe, it, expect } from 'vitest'

import {
  createPageChatSession,
  appendPageSnapshot,
  addChatTurn,
  compactSessionTurns,
} from '../extension/lib/chat-session.js'
import {
  chunkPageText,
  selectPageContext,
  buildPageChatMessages,
} from '../extension/lib/chat-context.js'

describe('page chat session model', () => {
  it('creates a session keyed by page and language', () => {
    const session = createPageChatSession({ pageKey: 'https://example.com/story', language: 'zh' })

    expect(session.sessionKey).toBe('page:https://example.com/story::zh')
    expect(session.sourceType).toBe('webpage')
    expect(session.pageKey).toBe('https://example.com/story')
    expect(session.turns).toEqual([])
  })

  it('stores page snapshots and compacted memory', () => {
    const session = createPageChatSession({ pageKey: 'https://example.com/story', language: 'en' })

    appendPageSnapshot(session, {
      contentText: 'The article explains the release plan and launch checklist.',
      focusText: 'release plan',
      pageChunks: [{ id: 'page-1', text: 'The article explains the release plan.', index: 0 }],
      summaryDigest: 'Release planning overview.',
    })

    for (let index = 1; index <= 6; index += 1) {
      addChatTurn(session, { role: 'user', content: `question ${index}` })
      addChatTurn(session, { role: 'assistant', content: `answer ${index}` })
    }

    compactSessionTurns(session, { keepLastTurns: 4 })

    expect(session.contentText).toContain('release plan')
    expect(session.focusText).toBe('release plan')
    expect(session.summaryDigest).toBe('Release planning overview.')
    expect(session.turns).toHaveLength(4)
    expect(session.memorySummary).toContain('question 1')
  })
})

describe('page chat context', () => {
  const pageText = [
    'QuickSummarize now supports reading ordinary webpages in the side panel.',
    'The design keeps webpage entry non-intrusive and relies on the side panel plus context menu.',
    'When selected text exists, the chat should focus on the selected passage first.',
    'The first release does not include YouTube timeline or timestamp citations for webpage mode.',
  ].join(' ')

  it('chunks page text into bounded windows', () => {
    const chunks = chunkPageText(pageText, { maxChars: 90 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].id).toBe('page-1')
  })

  it('selects relevant page chunks for a question', () => {
    const chunks = chunkPageText(pageText, { maxChars: 120 })
    const result = selectPageContext({
      question: 'How does it handle selected text?',
      pageChunks: chunks,
      focusText: 'selected passage first',
      maxChunks: 2,
    })

    expect(result.chunks).toHaveLength(2)
    expect(result.chunks.map((chunk) => chunk.text).join(' ')).toContain('selected')
  })

  it('builds grounded page chat messages with focus and memory', () => {
    const chunks = chunkPageText(pageText, { maxChars: 120 })
    const messages = buildPageChatMessages({
      language: 'en',
      question: 'Can webpage mode cite timestamps?',
      summaryDigest: 'The article compares webpage mode against the YouTube flow.',
      memorySummary: 'Earlier the user asked about side panel launch.',
      focusText: 'selected passage first',
      pageChunks: chunks.slice(1, 3),
      recentTurns: [
        { role: 'user', content: 'How do I open webpage mode?' },
        { role: 'assistant', content: 'Use the side panel or context menu.' },
      ],
    })

    expect(messages[0].role).toBe('system')
    expect(messages.map((message) => message.content).join('\n')).toContain('current webpage')
    expect(messages.map((message) => message.content).join('\n')).toContain('selected passage first')
    expect(messages[messages.length - 1].content).toBe('Can webpage mode cite timestamps?')
  })
})
