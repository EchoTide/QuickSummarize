import { completeChatStream } from './llm.js'

function normalizeSegments(segments = []) {
  if (!Array.isArray(segments)) return []

  return segments
    .map((segment, index) => ({
      index,
      startSec: Number.isFinite(Number(segment?.startSec)) ? Math.max(0, Number(segment.startSec)) : null,
      text: String(segment?.text || '').trim(),
    }))
    .filter((segment) => segment.text)
}

export function buildTimelineChunks(segments = [], options = {}) {
  const windowSec = Number.isFinite(options.windowSec) && options.windowSec > 0 ? options.windowSec : 120
  const maxChars = Number.isFinite(options.maxChars) && options.maxChars > 0 ? options.maxChars : 1600

  const rows = normalizeSegments(segments)
  if (rows.length === 0) return []

  const chunks = []
  let current = {
    startSec: rows[0].startSec ?? 0,
    text: rows[0].text,
  }

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const currentStart = Number.isFinite(current.startSec) ? current.startSec : 0
    const rowStart = Number.isFinite(row.startSec) ? row.startSec : currentStart
    const span = rowStart - currentStart
    const nextText = `${current.text} ${row.text}`.trim()

    if (span > windowSec || nextText.length > maxChars) {
      chunks.push(current)
      current = {
        startSec: Number.isFinite(row.startSec) ? row.startSec : currentStart,
        text: row.text,
      }
      continue
    }

    current = {
      startSec: currentStart,
      text: nextText,
    }
  }

  chunks.push(current)
  return chunks
}

function toTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hour = Math.floor(total / 3600)
  const minute = Math.floor((total % 3600) / 60)
  const second = total % 60

  if (hour > 0) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  }

  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function parseTimestampToSec(value) {
  if (Number.isFinite(Number(value))) {
    return Math.max(0, Number(value))
  }

  const text = String(value || '').trim()
  if (!text) return null

  const match = text.match(/^(\d{1,2}:)?\d{1,2}:\d{2}$/)
  if (!match) return null

  const parts = text.split(':').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) return null

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  return parts[0] * 60 + parts[1]
}

function buildTimelineInput(segments = [], maxChars = 18000) {
  const rows = normalizeSegments(segments)
  if (rows.length === 0) return ''

  const lines = []
  let length = 0

  for (const row of rows) {
    const startSec = Number.isFinite(row.startSec) ? row.startSec : 0
    const line = `[${toTimestamp(startSec)}] ${row.text}`
    const nextLength = length + line.length + 1

    if (nextLength > maxChars) {
      if (lines.length === 0) {
        lines.push(line.slice(0, Math.max(0, maxChars - 1)))
      }
      break
    }

    lines.push(line)
    length = nextLength
  }

  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
}

function splitTimelineBatches(segments = [], options = {}) {
  const rows = normalizeSegments(segments)
  if (rows.length === 0) return []

  const maxChars = Number.isFinite(options.maxChars) && options.maxChars > 0 ? options.maxChars : 7200
  const maxItems = Number.isFinite(options.maxItems) && options.maxItems > 0 ? options.maxItems : 72

  const batches = []
  let currentRows = []
  let currentChars = 0

  const pushCurrent = () => {
    if (currentRows.length === 0) return
    batches.push({
      rows: currentRows,
      input: buildTimelineInput(currentRows, maxChars),
    })
    currentRows = []
    currentChars = 0
  }

  for (const row of rows) {
    const line = `[${toTimestamp(Number.isFinite(row.startSec) ? row.startSec : 0)}] ${row.text}`
    const nextChars = currentChars + line.length + 1

    if (currentRows.length > 0 && (nextChars > maxChars || currentRows.length >= maxItems)) {
      pushCurrent()
    }

    currentRows.push(row)
    currentChars += line.length + 1
  }

  pushCurrent()
  return batches
}

function estimateTimelineSections(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return 6
  const first = Number(rows[0]?.startSec || 0)
  const last = Number(rows[rows.length - 1]?.startSec || first)
  const durationMin = Math.max(1, Math.ceil((last - first) / 60))
  const totalChars = rows.reduce((sum, row) => sum + String(row?.text || '').length, 0)

  let target = 13

  if (durationMin <= 8) target = 5
  else if (durationMin <= 15) target = 7
  else if (durationMin <= 30) target = 9
  else if (durationMin <= 50) target = 11

  if (rows.length >= 36 || totalChars >= 2200) target += 1
  if (rows.length >= 60 || totalChars >= 4200) target += 1

  return Math.min(15, target)
}

function getBatchLimit(totalTarget, batchCount, batchIndex) {
  const safeTotal = Math.max(3, Number(totalTarget) || 6)
  const safeBatchCount = Math.max(1, Number(batchCount) || 1)
  const base = Math.floor(safeTotal / safeBatchCount)
  const remainder = safeTotal % safeBatchCount
  return Math.max(2, base + (batchIndex < remainder ? 1 : 0))
}

function buildTimelineUserPrompt(prefix, timelineInput, language, maxItems) {
  if (language === 'zh') {
    return `# Task
${prefix}

## Rules
1. 输出语言必须是中文；先理解内容，再把每条输出项翻译并总结为中文。
2. 每条必须写出具体主题、动作或结论，避免“开场介绍”“继续讲解”“三件事”这类空泛说法；如果提到数量，必须点明具体是什么。
3. 优先按主题变化切分；如果字幕很密，可以切得更细，但不要把相邻重复内容拆得过碎。
4. 最多 ${maxItems} 条，不要超出。
5. 只能输出 JSON 数组，不要任何额外文本。

## Output Schema
[{"startSec": 0, "text": "示例总结"}]

## Subtitle Chunk
${timelineInput}

## Final Reminder
请严格遵守指令：即使字幕混合多语言，也必须把每条输出项翻译并输出为中文。`
  }

  return `# Task
${prefix}

## Rules
1. Output language must be English; understand first, then translate each output item into English summary text.
2. Each item must include a concrete topic, action, or takeaway. Avoid vague labels like "intro", "overview", "more details", or "three things" by themselves.
3. Split by topic shifts first. If subtitles are dense, use finer sections, but do not create repetitive adjacent items.
4. At most ${maxItems} items.
5. Output JSON array only, with no extra prose.

## Output Schema
[{"startSec": 0, "text": "Example summary"}]

## Subtitle Chunk
${timelineInput}

## Final Reminder
Strictly follow this instruction: even if subtitles are mixed-language, translate every output item to English and never output non-English summary text.`
}

function getTimelinePrompt(language) {
  if (language === 'zh') {
    return {
      system:
        '你是视频内容助手。根据带时间戳的字幕，输出严格 JSON 数组。每个元素必须是 {"startSec": number, "text": string}。要求：1) 按时间升序；2) 每条 text 用中文 1 句概括该时间段；3) 不要 markdown，不要代码块，不要额外解释。',
      userPrefix: '请生成时间线分段总结 JSON：',
    }
  }

  return {
    system:
      'You are a video assistant. From timestamped subtitles, output a strict JSON array only. Each item must be {"startSec": number, "text": string}. Rules: 1) sort by time ascending; 2) each text is one concise English sentence for that section; 3) no markdown, no code fence, no extra commentary.',
    userPrefix: 'Generate timeline summary JSON from these subtitles:',
  }
}

function stripCodeFence(text) {
  const content = String(text || '').trim()
  if (!content.startsWith('```')) return content
  return content.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim()
}

function parseTimelineItems(raw) {
  let parsed
  try {
    parsed = JSON.parse(stripCodeFence(raw))
  } catch {
    const source = stripCodeFence(raw)
    const firstArray = source.indexOf('[')
    const lastArray = source.lastIndexOf(']')
    if (firstArray === -1 || lastArray <= firstArray) {
      throw new Error('Invalid timeline JSON')
    }
    parsed = JSON.parse(source.slice(firstArray, lastArray + 1))
  }

  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.timeline) ? parsed.timeline : []
  const normalized = list
    .map((item) => {
      const startSec = parseTimestampToSec(item?.startSec ?? item?.start ?? item?.time ?? item?.timestamp)
      const text = String(item?.text ?? item?.summary ?? item?.content ?? '').trim()
      if (!Number.isFinite(startSec) || !text) return null

      return {
        startSec: Math.max(0, Number(startSec)),
        text,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.startSec - b.startSec)

  if (normalized.length === 0) {
    throw new Error('Timeline output is empty')
  }

  return normalized
}

function containsCJK(text) {
  return /[\u3400-\u9FFF]/.test(String(text || ''))
}

function countLatinLetters(text) {
  const matched = String(text || '').match(/[A-Za-z]/g)
  return matched ? matched.length : 0
}

function hasLanguageMismatch(items = [], language = 'en') {
  if (!Array.isArray(items) || items.length === 0) return false

  const combined = items.map((item) => String(item?.text || '')).join(' ')
  if (!combined.trim()) return false

  if (language === 'en') {
    return containsCJK(combined)
  }

  if (language === 'zh') {
    return !containsCJK(combined) && countLatinLetters(combined) > 24
  }

  return false
}

function buildLanguageCorrectionPrompt(language) {
  if (language === 'zh') {
    return 'Critical correction: your previous output violated language rules. Keep the same timeline meaning, translate each item into Chinese only, do not add new information, do not output other languages, and output strict JSON array only.'
  }

  return 'Critical correction: your previous output violated language rules. Keep the same timeline meaning, translate each item into English only, do not add new information, do not output non-English text, and output strict JSON array only.'
}

function isGenericTimelineText(text, language = 'en') {
  const value = String(text || '').trim()
  if (!value) return true

  if (language === 'zh') {
    if (/^[一二三四五六七八九十两0-9]+(件事|点|部分|步骤|问题)$/.test(value)) return true
    if (/^(开场|开头|引言|背景|总结|收尾|过渡|开场介绍|内容介绍|背景介绍|继续讲解|继续介绍|案例分享|方法讲解)$/.test(value)) return true
    return value.length <= 8 && /^(介绍|总结|说明|方法|技巧|步骤|重点|内容|案例)/.test(value)
  }

  const lower = value.toLowerCase()
  if (/^(three|four|five|several) (things|points|steps|ideas)$/.test(lower)) return true
  return lower.length <= 16 && /^(more details|key points|main content|next part)$/.test(lower)
}

function hasGenericTimelineItems(items = [], language = 'en') {
  return Array.isArray(items) && items.some((item) => isGenericTimelineText(item?.text, language))
}

function buildQualityCorrectionPrompt(language) {
  if (language === 'zh') {
    return 'Critical correction: your previous output is too generic. Keep the same timeline meaning, but rewrite each item in Chinese with a concrete topic, action, or takeaway. Do not use vague labels like "开场介绍" or "三件事" by themselves. If an item mentions a count, spell out the actual items. Output strict JSON array only.'
  }

  return 'Critical correction: your previous output is too generic. Keep the same timeline meaning, but rewrite each item in English with a concrete topic, action, or takeaway. Do not use vague labels like "intro" or "three things" by themselves. If an item mentions a count, spell out the actual items. Output strict JSON array only.'
}

function buildLocalFallback(segments = [], language = 'en') {
  const chunks = buildTimelineChunks(segments, { windowSec: 120, maxChars: 900 })
  const maxLen = language === 'zh' ? 42 : 88

  return chunks.map((chunk) => {
    const cleanText = String(chunk.text || '').replace(/\s+/g, ' ').trim()
    const sentence = cleanText.split(/[。！？.!?]/)[0]?.trim() || cleanText
    const shortText = sentence.length > maxLen ? `${sentence.slice(0, maxLen)}...` : sentence

    return {
      startSec: Number.isFinite(Number(chunk.startSec)) ? Math.max(0, Number(chunk.startSec)) : 0,
      text: shortText || cleanText,
    }
  })
}

export async function summarizeTimelineChunks(
  config,
  segments = [],
  language = 'en',
  completeFn = completeChatStream,
  signal,
  transcriptText = '',
  onProgress
) {
  let rows = normalizeSegments(segments)
  if (rows.length === 0) {
    const fallbackText = String(transcriptText || '').trim()
    if (fallbackText) {
      rows = [{ index: 0, startSec: 0, text: fallbackText }]
    }
  }

  if (rows.length === 0) return []

  const prompt = getTimelinePrompt(language)
  const batches = splitTimelineBatches(rows)
  const totalTargetItems = estimateTimelineSections(rows)
  const merged = []

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]
    const maxItemsForBatch = getBatchLimit(totalTargetItems, batches.length, batchIndex)
    const messages = [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: buildTimelineUserPrompt(prompt.userPrefix, batch.input, language, maxItemsForBatch),
      },
    ]

    const response = String(await completeFn(config, messages, signal) || '').trim()

    try {
      let parsedItems = parseTimelineItems(response)

      const needsLanguageCorrection = hasLanguageMismatch(parsedItems, language)
      const needsQualityCorrection = hasGenericTimelineItems(parsedItems, language)

      if (needsLanguageCorrection || needsQualityCorrection) {
        const correctionMessages = [
          { role: 'system', content: prompt.system },
          {
            role: 'user',
            content: needsLanguageCorrection
              ? buildLanguageCorrectionPrompt(language)
              : buildQualityCorrectionPrompt(language),
          },
          { role: 'assistant', content: response },
        ]
        const corrected = String(await completeFn(config, correctionMessages, signal) || '').trim()
        parsedItems = parseTimelineItems(corrected)

        if (hasLanguageMismatch(parsedItems, language) || hasGenericTimelineItems(parsedItems, language)) {
          throw new Error('Timeline correction failed')
        }
      }

      merged.push(...parsedItems)
    } catch {
      merged.push(...buildLocalFallback(batch.rows, language))
    }

    if (typeof onProgress === 'function') {
      onProgress({
        completedBatches: batchIndex + 1,
        totalBatches: batches.length,
        items: [...merged].sort((a, b) => a.startSec - b.startSec),
      })
    }
  }

  return merged.sort((a, b) => a.startSec - b.startSec)
}
