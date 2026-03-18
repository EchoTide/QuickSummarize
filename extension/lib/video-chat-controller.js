import {
  createVideoChatSession,
  resetVideoChatSession,
} from './chat-session.js'
import {
  selectTranscriptContext,
  buildChatMessages,
} from './chat-context.js'

function isOpeningQuestion(question) {
  const text = String(question || '').trim().toLowerCase()
  return /(^|\s)(first|opening|start|beginning)/.test(text) || /开头|第一句|第一句话|最开始/.test(text)
}

function isEndingQuestion(question) {
  const text = String(question || '').trim().toLowerCase()
  return /(^|\s)(ending|end|final|last)/.test(text) || /结尾|最后一句|最后说了什么|收尾/.test(text)
}

function pickDirectionalFallbackChunks(chunks = [], question = '', maxChunks = 3) {
  if (!Array.isArray(chunks) || chunks.length === 0) return []
  const limit = Math.max(1, Number(maxChunks) || 3)
  if (isOpeningQuestion(question)) {
    return chunks.slice(0, limit)
  }
  if (isEndingQuestion(question)) {
    return chunks.slice(Math.max(0, chunks.length - limit)).reverse()
  }
  return chunks.slice(0, limit)
}

function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hour = Math.floor(seconds / 3600)
  const minute = Math.floor((seconds % 3600) / 60)
  const second = seconds % 60

  if (hour > 0) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  }

  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function parseTimestamp(label) {
  const text = String(label || '').trim()
  if (!text) return null
  const parts = text.split(':').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

export function syncVideoChatSession(currentSession, { videoId = '', language = 'en', forceReset = false } = {}) {
  if (!currentSession) {
    return createVideoChatSession({ videoId, language })
  }

  if (forceReset || currentSession.videoId !== videoId || currentSession.language !== language) {
    return resetVideoChatSession(currentSession, { videoId, language })
  }

  return currentSession
}

export function prepareVideoChatRequest(session, { question = '', maxChunks = 3 } = {}) {
  let selected = selectTranscriptContext({
    question,
    transcriptChunks: session?.transcriptChunks || [],
    recentChunkIds: Object.keys(session?.citationMap || {}),
    maxChunks,
  })

  if ((!selected.chunks || selected.chunks.length === 0) && Array.isArray(session?.transcriptChunks) && session.transcriptChunks.length > 0) {
    selected = {
      chunks: pickDirectionalFallbackChunks(session.transcriptChunks, question, maxChunks),
      fallbackUsed: true,
    }
  }

  const recentTurns = Array.isArray(session?.turns) ? session.turns.slice(-6) : []
  const messages = buildChatMessages({
    language: session?.language || 'en',
    question,
    summaryDigest: session?.summaryDigest || '',
    memorySummary: session?.memorySummary || '',
    transcriptChunks: selected.chunks,
    transcriptFallbackText: session?.transcriptText || '',
    recentTurns,
  })

  return {
    messages,
    selectedChunks: selected.chunks,
    usedFallback: selected.fallbackUsed,
  }
}

export function extractChatCitations(text, { transcriptChunks = [] } = {}) {
  const labels = String(text || '').match(/\[[^\]]+\]/g) || []
  const seen = new Set()
  const chunkMap = new Map(
    (Array.isArray(transcriptChunks) ? transcriptChunks : []).map((chunk) => [String(chunk?.id || ''), chunk])
  )

  return labels
    .map((rawLabel) => rawLabel.slice(1, -1).trim())
    .map((label) => {
      const chunk = chunkMap.get(label)
      if (chunk) {
        return {
          label,
          startSec: Number.isFinite(Number(chunk?.startSec)) ? Math.max(0, Number(chunk.startSec)) : 0,
        }
      }

      const parsed = parseTimestamp(label)
      if (parsed == null) return null
      return { label, startSec: parsed }
    })
    .filter(Boolean)
    .filter((citation) => {
      const key = `${citation.label}:${citation.startSec}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function buildCitationMap(transcriptChunks = []) {
  return (Array.isArray(transcriptChunks) ? transcriptChunks : []).reduce((map, chunk) => {
    const id = String(chunk?.id || '').trim()
    if (!id) return map
    map[id] = formatTimestamp(chunk?.startSec)
    return map
  }, {})
}
