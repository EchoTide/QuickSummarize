import { describe, it, expect } from 'vitest'

import {
  createVideoChatSession,
  appendTranscriptSnapshot,
  addChatTurn,
  compactSessionTurns,
  resetVideoChatSession,
} from '../extension/lib/chat-session.js'
import {
  chunkTranscriptSegments,
  selectTranscriptContext,
  buildChatMessages,
} from '../extension/lib/chat-context.js'

describe('video chat session model', () => {
  it('creates a session keyed by video and language', () => {
    const session = createVideoChatSession({ videoId: 'abc123', language: 'zh' })

    expect(session.sessionKey).toBe('abc123::zh')
    expect(session.videoId).toBe('abc123')
    expect(session.language).toBe('zh')
    expect(session.turns).toEqual([])
    expect(session.transcriptChunks).toEqual([])
    expect(session.memorySummary).toBe('')
  })

  it('stores transcript snapshots and summary digest on the session', () => {
    const session = createVideoChatSession({ videoId: 'abc123', language: 'en' })

    appendTranscriptSnapshot(session, {
      transcriptText: 'hello world transcript',
      transcriptChunks: [{ id: 'chunk-1', text: 'hello world transcript', startSec: 0 }],
      summaryDigest: 'short summary',
    })

    expect(session.transcriptText).toBe('hello world transcript')
    expect(session.summaryDigest).toBe('short summary')
    expect(session.transcriptChunks).toHaveLength(1)
  })

  it('compacts older turns into memory while preserving recent turns', () => {
    const session = createVideoChatSession({ videoId: 'abc123', language: 'en' })

    for (let index = 1; index <= 6; index += 1) {
      addChatTurn(session, { role: 'user', content: `question ${index}` })
      addChatTurn(session, { role: 'assistant', content: `answer ${index}` })
    }

    compactSessionTurns(session, { keepLastTurns: 4 })

    expect(session.turns).toHaveLength(4)
    expect(session.turns[0].content).toBe('question 5')
    expect(session.memorySummary).toContain('question 1')
    expect(session.memorySummary).toContain('answer 4')
  })

  it('resets chat turns and memory for a new video session', () => {
    const session = createVideoChatSession({ videoId: 'abc123', language: 'en' })
    addChatTurn(session, { role: 'user', content: 'old question' })
    session.memorySummary = 'old memory'

    const reset = resetVideoChatSession(session, { videoId: 'def456', language: 'zh' })

    expect(reset.sessionKey).toBe('def456::zh')
    expect(reset.turns).toEqual([])
    expect(reset.memorySummary).toBe('')
  })
})

describe('video chat transcript context', () => {
  const segments = [
    { startSec: 0, text: 'The speaker introduces QuickSummarize and explains the Chrome extension overview.' },
    { startSec: 25, text: 'The video then explains how subtitle chat can answer follow-up questions from transcript evidence.' },
    { startSec: 55, text: 'Later the speaker compares summary view, chat workspace, and timeline navigation for long videos.' },
    { startSec: 82, text: 'Finally the speaker discusses memory compaction and re-reading transcript chunks when context is missing.' },
  ]

  it('chunks transcript segments into bounded transcript windows', () => {
    const chunks = chunkTranscriptSegments(segments, { maxChars: 140 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].id).toBe('chunk-1')
    expect(chunks[0].text).toContain('QuickSummarize')
  })

  it('selects relevant transcript chunks for the user question', () => {
    const chunks = chunkTranscriptSegments(segments, { maxChars: 180 })
    const result = selectTranscriptContext({
      question: 'How does memory compaction work when the chat forgets older history?',
      transcriptChunks: chunks,
      recentChunkIds: ['chunk-2'],
      maxChunks: 2,
    })

    expect(result.chunks).toHaveLength(2)
    expect(result.chunks[0].text).toContain('memory compaction')
    expect(result.fallbackUsed).toBe(false)
  })

  it('falls back to neighboring transcript chunks when lexical retrieval misses', () => {
    const chunks = chunkTranscriptSegments(segments, { maxChars: 180 })
    const result = selectTranscriptContext({
      question: 'What happened in the middle section?',
      transcriptChunks: chunks,
      preferredChunkIds: ['chunk-2'],
      maxChunks: 2,
    })

    expect(result.chunks).toHaveLength(2)
    expect(result.chunks.map((chunk) => chunk.id)).toContain('chunk-2')
    expect(result.fallbackUsed).toBe(true)
  })

  it('builds grounded chat messages from digest, memory, transcript chunks, and recent turns', () => {
    const chunks = chunkTranscriptSegments(segments, { maxChars: 180 })
    const messages = buildChatMessages({
      language: 'en',
      question: 'What is the difference between summary view and chat workspace?',
      summaryDigest: 'This video explains QuickSummarize UI and transcript-grounded chat.',
      memorySummary: 'Earlier the user asked about setup and subtitle fetching.',
      transcriptChunks: chunks.slice(1, 3),
      recentTurns: [
        { role: 'user', content: 'How does subtitle fetching work?' },
        { role: 'assistant', content: 'It reads the current video transcript.' },
      ],
    })

    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('active video transcript')
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'What is the difference between summary view and chat workspace?',
    })
    expect(messages.map((message) => message.content).join('\n')).toContain('Earlier the user asked about setup')
    expect(messages.map((message) => message.content).join('\n')).toContain('summary view, chat workspace')
  })
})
