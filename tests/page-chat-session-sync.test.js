import { describe, it, expect } from 'vitest'

import {
  createPageChatSession,
  addChatTurn,
  syncPageChatSession,
} from '../extension/lib/chat-session.js'

describe('syncPageChatSession', () => {
  it('preserves webpage chat turns when the same page context refreshes', () => {
    const session = createPageChatSession({ pageKey: 'https://example.com/story', language: 'en' })
    addChatTurn(session, { role: 'user', content: 'What is this article about?' })
    addChatTurn(session, { role: 'assistant', content: 'It is about product updates.' })

    const synced = syncPageChatSession(session, {
      pageKey: 'https://example.com/story',
      language: 'en',
    })

    expect(synced).toBe(session)
    expect(synced.turns).toHaveLength(2)
    expect(synced.turns[1].content).toBe('It is about product updates.')
  })

  it('resets webpage chat turns when the page key changes', () => {
    const session = createPageChatSession({ pageKey: 'https://example.com/story', language: 'en' })
    addChatTurn(session, { role: 'user', content: 'keep me?' })

    const synced = syncPageChatSession(session, {
      pageKey: 'https://example.com/other',
      language: 'en',
    })

    expect(synced).not.toBe(session)
    expect(synced.pageKey).toBe('https://example.com/other')
    expect(synced.turns).toEqual([])
  })
})
