function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const code = Number.parseInt(hex, 16)
      return Number.isNaN(code) ? match : String.fromCharCode(code)
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = Number.parseInt(dec, 10)
      return Number.isNaN(code) ? match : String.fromCharCode(code)
    })
}

function parseXmlAttributes(raw) {
  const attrs = {}
  const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g
  let match

  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = decodeHtmlEntities(match[2])
  }

  return attrs
}

function normalizeTranscriptSegmentText(value) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function toTranscriptText(segments) {
  return segments.map((segment) => segment.text).filter(Boolean).join(' ').trim()
}

function parseTranscriptXmlSegments(xml) {
  const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g
  const segments = []
  let match

  while ((match = textRegex.exec(xml || '')) !== null) {
    const attrs = parseXmlAttributes(match[1] || '')
    const start = Number.parseFloat(attrs.start)
    const text = normalizeTranscriptSegmentText(match[2])
    if (!text) continue

    segments.push({
      startSec: Number.isFinite(start) ? Math.max(0, start) : null,
      text,
    })
  }

  return segments
}

function parseTranscriptSrv3XmlSegments(xml) {
  const paragraphRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g
  const segmentRegex = /<s\b([^>]*)>([\s\S]*?)<\/s>/g
  const segments = []
  let paragraphMatch

  while ((paragraphMatch = paragraphRegex.exec(xml || '')) !== null) {
    const paragraphAttrs = parseXmlAttributes(paragraphMatch[1] || '')
    const paragraphStartMs = Number.parseFloat(paragraphAttrs.t)
    const paragraphStartSec = Number.isFinite(paragraphStartMs) ? Math.max(0, paragraphStartMs / 1000) : null
    const paragraph = paragraphMatch[2] || ''

    let hasNested = false
    let segmentMatch
    while ((segmentMatch = segmentRegex.exec(paragraph)) !== null) {
      hasNested = true
      const segmentAttrs = parseXmlAttributes(segmentMatch[1] || '')
      const relativeStartMs = Number.parseFloat(segmentAttrs.t)
      const text = normalizeTranscriptSegmentText(segmentMatch[2])
      if (!text) continue

      const offsetSec = Number.isFinite(relativeStartMs) ? Math.max(0, relativeStartMs / 1000) : 0
      const startSec = paragraphStartSec === null ? null : paragraphStartSec + offsetSec
      segments.push({ startSec, text })
    }

    if (!hasNested) {
      const text = normalizeTranscriptSegmentText(paragraph)
      if (text) {
        segments.push({ startSec: paragraphStartSec, text })
      }
    }
  }

  return segments
}

function parseVttTimeToSeconds(value) {
  const cleaned = String(value || '').trim()
  const match = cleaned.match(/^(?:(\d+):)?(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!match) return null

  const hours = Number.parseInt(match[1] || '0', 10)
  const minutes = Number.parseInt(match[2] || '0', 10)
  const seconds = Number.parseInt(match[3] || '0', 10)
  const millisRaw = match[4] || '0'
  const millis = Number.parseInt(millisRaw.padEnd(3, '0').slice(0, 3), 10)

  if ([hours, minutes, seconds, millis].some((x) => Number.isNaN(x))) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

function parseTranscriptVttSegments(vttText) {
  if (typeof vttText !== 'string' || !vttText.includes('-->')) return []

  const lines = vttText.replace(/\r/g, '').split('\n')
  const segments = []
  let currentLines = []
  let currentStartSec = null
  let lastSegment = ''

  const flushCue = () => {
    if (currentLines.length === 0) return
    const cueText = normalizeTranscriptSegmentText(currentLines.join(' '))
    currentLines = []

    if (cueText && cueText !== lastSegment) {
      segments.push({ startSec: currentStartSec, text: cueText })
      lastSegment = cueText
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      flushCue()
      currentStartSec = null
      continue
    }

    if (trimmed === 'WEBVTT' || trimmed.startsWith('NOTE')) continue
    if (/^\d+$/.test(trimmed)) continue

    if (trimmed.includes('-->')) {
      flushCue()
      const [from] = trimmed.split('-->')
      currentStartSec = parseVttTimeToSeconds(from)
      continue
    }

    if (trimmed.startsWith('STYLE') || trimmed.startsWith('REGION')) continue
    currentLines.push(trimmed)
  }

  flushCue()
  return segments
}

function parseTranscriptJson3Segments(text) {
  try {
    const normalizedText = String(text || '').replace(/^\)\]\}'\s*\n?/, '').trim()
    const data = JSON.parse(normalizedText)
    if (!Array.isArray(data?.events)) return []

    const segments = []

    for (const event of data.events) {
      if (!Array.isArray(event?.segs)) continue

      const segmentText = normalizeTranscriptSegmentText(event.segs.map((segment) => segment.utf8 || '').join(''))
      if (!segmentText || segmentText === '\n') continue

      const startMs = Number.parseFloat(event.tStartMs)
      segments.push({
        startSec: Number.isFinite(startMs) ? Math.max(0, startMs / 1000) : null,
        text: segmentText,
      })
    }

    return segments
  } catch {
    return []
  }
}

export function parseTranscriptXml(xml) {
  return toTranscriptText(parseTranscriptXmlSegments(xml))
}

function parseTranscriptSrv3Xml(xml) {
  return toTranscriptText(parseTranscriptSrv3XmlSegments(xml))
}

function parseTranscriptVtt(vttText) {
  return toTranscriptText(parseTranscriptVttSegments(vttText))
}

export function parseTranscriptJson3(text) {
  return toTranscriptText(parseTranscriptJson3Segments(text))
}

export function parseTranscriptDetailedResponse(text) {
  const xmlSegments = parseTranscriptXmlSegments(text)
  if (xmlSegments.length > 0) {
    return { text: toTranscriptText(xmlSegments), segments: xmlSegments }
  }

  const srv3Segments = parseTranscriptSrv3XmlSegments(text)
  if (srv3Segments.length > 0) {
    return { text: toTranscriptText(srv3Segments), segments: srv3Segments }
  }

  const jsonSegments = parseTranscriptJson3Segments(text)
  if (jsonSegments.length > 0) {
    return { text: toTranscriptText(jsonSegments), segments: jsonSegments }
  }

  const vttSegments = parseTranscriptVttSegments(text)
  if (vttSegments.length > 0) {
    return { text: toTranscriptText(vttSegments), segments: vttSegments }
  }

  return { text: '', segments: [] }
}

export function parseTranscriptResponse(text) {
  return parseTranscriptDetailedResponse(text).text
}

void parseTranscriptSrv3Xml
void parseTranscriptVtt
