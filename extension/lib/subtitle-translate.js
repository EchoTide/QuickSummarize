import { completeChat } from './llm.js'

const CJK_REGEX = /[\u3400-\u9fff]/g

function countCjkChars(text) {
  return (String(text || '').match(CJK_REGEX) || []).length
}

export function shouldTranslateSubtitles(segments = [], targetLanguage = 'en') {
  if (!Array.isArray(segments) || segments.length === 0) return false

  const sample = segments
    .slice(0, 12)
    .map((segment) => String(segment?.text || ''))
    .join(' ')
    .trim()

  if (!sample) return false

  const cjkCount = countCjkChars(sample)
  const cjkRatio = cjkCount / sample.length

  if (targetLanguage === 'zh') {
    return cjkRatio < 0.05
  }

  if (targetLanguage === 'en') {
    return cjkRatio > 0.1
  }

  return false
}

export function chunkMergedSubtitles(segments = [], options = {}) {
  const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : 20
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : 2200

  const rows = segments
    .map((segment, index) => ({
      index,
      startSec: segment?.startSec,
      text: String(segment?.text || '').trim(),
    }))
    .filter((row) => row.text)

  if (rows.length === 0) return []

  const chunks = []
  let currentChunk = []
  let currentChars = 0

  for (const row of rows) {
    const rowSize = row.text.length + 24
    const shouldSplit =
      currentChunk.length > 0 &&
      (currentChunk.length >= maxItems || currentChars + rowSize > maxChars)

    if (shouldSplit) {
      chunks.push(currentChunk)
      currentChunk = []
      currentChars = 0
    }

    currentChunk.push(row)
    currentChars += rowSize
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

function parseJsonArray(content) {
  const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '')
  const arrayStart = raw.indexOf('[')
  const arrayEnd = raw.lastIndexOf(']')
  const jsonText = arrayStart >= 0 && arrayEnd > arrayStart ? raw.slice(arrayStart, arrayEnd + 1) : raw

  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []
  return parsed
}

async function defaultTranslateChunk({ config, targetLanguage, inputItems, signal }) {
  const targetName = targetLanguage === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English (en)'
  const messages = [
    {
      role: 'system',
      content:
        'You are a subtitle translator. Return strict JSON only. Do not add commentary or markdown.',
    },
    {
      role: 'user',
      content:
        `Translate subtitle rows into ${targetName}. Keep each row concise and natural for subtitles. ` +
        'Return JSON array: [{"index": number, "text": string}]. ' +
        'Preserve index values exactly.\n\nInput:\n' +
        JSON.stringify(inputItems.map((item) => ({ index: item.index, text: item.text }))),
    },
  ]

  const content = await completeChat(config, messages, signal)
  return parseJsonArray(content)
}

export async function translateMergedSubtitles(
  config,
  mergedSegments = [],
  targetLanguage = 'en',
  translateChunk = defaultTranslateChunk,
  signal
) {
  if (!Array.isArray(mergedSegments) || mergedSegments.length === 0) {
    return []
  }

  const chunks = chunkMergedSubtitles(mergedSegments)
  const translatedByIndex = new Map()

  for (const chunk of chunks) {
    if (signal?.aborted) {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      throw error
    }

    const translated = await translateChunk({
      config,
      targetLanguage,
      inputItems: chunk,
      signal,
    })

    for (const row of translated) {
      const index = Number(row?.index)
      const text = String(row?.text || '').trim()
      if (!Number.isInteger(index) || !text) continue
      translatedByIndex.set(index, text)
    }
  }

  return mergedSegments.map((segment, index) => ({
    ...segment,
    text: translatedByIndex.get(index) || segment.text,
  }))
}
