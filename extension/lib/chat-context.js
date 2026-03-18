const WORD_REGEX = /[a-z0-9\u3400-\u9fff]+/gi
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'when', 'what', 'how', 'does', 'work', 'into', 'then', 'they', 'them', 'your', 'have', 'will', 'about', 'older', 'history', 'middle', 'section'])

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .match(WORD_REGEX) || []
}

function meaningfulTerms(text) {
  return tokenize(text).filter((term) => term.length > 2 && !STOP_WORDS.has(term))
}

function uniqueWords(text) {
  return new Set(meaningfulTerms(text))
}

function scoreChunk(chunk, terms, recentIds = new Set()) {
  const words = uniqueWords(chunk?.text)
  let score = 0

  for (const term of terms) {
    if (words.has(term)) score += 2
  }

  if (recentIds.has(chunk?.id)) score += 1
  return score
}

export function chunkTranscriptSegments(segments = [], options = {}) {
  const maxChars = Number.isFinite(Number(options.maxChars)) ? Math.max(80, Number(options.maxChars)) : 800
  const rows = Array.isArray(segments)
    ? segments
        .map((segment) => ({
          startSec: Number.isFinite(Number(segment?.startSec)) ? Math.max(0, Number(segment.startSec)) : 0,
          text: normalizeText(segment?.text),
        }))
        .filter((segment) => segment.text)
    : []

  if (rows.length === 0) return []

  const chunks = []
  let current = null
  let currentSegments = []

  const pushCurrent = () => {
    if (!current) return
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      startSec: current.startSec,
      text: normalizeText(current.text),
      segments: currentSegments.map((segment) => ({ ...segment })),
    })
    current = null
    currentSegments = []
  }

  for (const row of rows) {
    if (!current) {
      current = { startSec: row.startSec, text: row.text }
      currentSegments = [row]
      continue
    }

    const nextText = normalizeText(`${current.text} ${row.text}`)
    if (nextText.length > maxChars) {
      pushCurrent()
      current = { startSec: row.startSec, text: row.text }
      currentSegments = [row]
      continue
    }

    current.text = nextText
    currentSegments.push(row)
  }

  pushCurrent()
  return chunks
}

export function selectTranscriptContext({
  question = '',
  transcriptChunks = [],
  recentChunkIds = [],
  preferredChunkIds = [],
  maxChunks = 3,
} = {}) {
  const list = Array.isArray(transcriptChunks) ? transcriptChunks : []
  const limit = Number.isFinite(Number(maxChunks)) ? Math.max(1, Number(maxChunks)) : 3
  const preferredSet = new Set(Array.isArray(preferredChunkIds) ? preferredChunkIds : [])
  const recentSet = new Set(Array.isArray(recentChunkIds) ? recentChunkIds : [])
  const terms = meaningfulTerms(question)

  let ranked = list
    .map((chunk, index) => ({
      chunk,
      index,
      score: scoreChunk(chunk, terms, recentSet),
      preferred: preferredSet.has(chunk?.id),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
      return a.index - b.index
    })

  let fallbackUsed = false
  let selected = ranked.filter((item) => item.score > 0).slice(0, limit)

  if ((selected.length === 0 || (preferredSet.size > 0 && selected.length < limit)) && preferredSet.size > 0) {
    fallbackUsed = true
    const preferredIndexes = list
      .map((chunk, index) => ({ chunk, index }))
      .filter((item) => preferredSet.has(item.chunk?.id))
      .map((item) => item.index)

    const around = new Set()
    preferredIndexes.forEach((index) => {
      around.add(index)
      if (around.size < limit && index + 1 < list.length) around.add(index + 1)
      if (around.size < limit && index - 1 >= 0) around.add(index - 1)
    })

    const fallbackItems = [...around]
      .sort((a, b) => a - b)
      .slice(0, limit)
      .map((index) => ({ chunk: list[index], index, score: 0, preferred: preferredSet.has(list[index]?.id) }))

    const merged = [...selected]
    for (const item of fallbackItems) {
      if (merged.some((entry) => entry.chunk?.id === item.chunk?.id)) continue
      if (merged.length >= limit) break
      merged.push(item)
    }

    selected = merged.slice(0, limit)
  }

  return {
    chunks: selected.map((item) => item.chunk),
    fallbackUsed,
  }
}

function buildTranscriptContextBlock(transcriptChunks = []) {
  return transcriptChunks
    .map((chunk) => {
      const startSec = Number.isFinite(Number(chunk?.startSec)) ? Math.max(0, Number(chunk.startSec)) : 0
      return `[${chunk?.id || 'chunk'} @ ${startSec}s]\n${normalizeText(chunk?.text)}`
    })
    .join('\n\n')
}

export function buildChatMessages({
  language = 'en',
  question = '',
  summaryDigest = '',
  memorySummary = '',
  transcriptChunks = [],
  transcriptFallbackText = '',
  recentTurns = [],
} = {}) {
  const isZh = language === 'zh'
  const system = isZh
    ? '你是一个基于当前视频字幕的对话助手。你只能依据 active video transcript 回答；证据不足时必须明确说明，并尽量引用相关字幕片段或近似时间。'
    : 'You are a chat assistant grounded in the active video transcript. Answer only from the active video transcript, say when evidence is missing, and cite relevant transcript chunks or approximate timestamps when possible.'

  const helperBlocks = []
  if (summaryDigest) helperBlocks.push(`Video digest:\n${normalizeText(summaryDigest)}`)
  if (memorySummary) helperBlocks.push(`Conversation memory:\n${normalizeText(memorySummary)}`)
  if (Array.isArray(transcriptChunks) && transcriptChunks.length > 0) {
    helperBlocks.push(`Transcript context:\n${buildTranscriptContextBlock(transcriptChunks)}`)
  }
  if (!transcriptChunks.length && transcriptFallbackText) {
    helperBlocks.push(`Full transcript fallback:\n${normalizeText(transcriptFallbackText)}`)
  }

  const messages = [{ role: 'system', content: system }]
  if (helperBlocks.length > 0) {
    messages.push({ role: 'system', content: helperBlocks.join('\n\n') })
  }

  for (const turn of Array.isArray(recentTurns) ? recentTurns : []) {
    if (turn?.role !== 'user' && turn?.role !== 'assistant') continue
    const content = normalizeText(turn?.content)
    if (!content) continue
    messages.push({ role: turn.role, content })
  }

  messages.push({ role: 'user', content: normalizeText(question) })
  return messages
}
