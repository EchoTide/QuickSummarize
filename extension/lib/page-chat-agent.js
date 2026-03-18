import { streamChatReply } from './llm.js'
import { buildPageChatMessages, selectPageContext } from './chat-context.js'

function toCitation(chunk) {
  return {
    label: String(chunk?.id || 'page'),
    index: Number.isFinite(Number(chunk?.index)) ? Number(chunk.index) : 0,
  }
}

export async function runPageChatAgentTurn({
  config = null,
  session,
  question,
  signal,
  onChunk,
  streamReply = streamChatReply,
} = {}) {
  const selected = selectPageContext({
    question,
    pageChunks: session?.pageChunks || [],
    focusText: session?.focusText || '',
    maxChunks: 2,
  })

  const messages = buildPageChatMessages({
    language: session?.language || 'en',
    question,
    summaryDigest: session?.summaryDigest || '',
    memorySummary: session?.memorySummary || '',
    focusText: session?.focusText || '',
    pageChunks: selected.chunks,
    pageFallbackText: session?.contentText || '',
    recentTurns: Array.isArray(session?.turns) ? session.turns.slice(-6) : [],
  })

  let answer = ''
  await streamReply(config, messages, (chunk) => {
    answer += String(chunk || '')
    if (typeof onChunk === 'function') onChunk(chunk)
  }, signal)

  return {
    answer,
    citations: selected.chunks.map(toCitation),
  }
}
