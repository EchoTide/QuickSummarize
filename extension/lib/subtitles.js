export function mergeSubtitleSegments(segments = [], windowSec = 10) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return []
  }

  const maxWindow = Number.isFinite(windowSec) && windowSec > 0 ? windowSec : 10
  const normalized = segments
    .map((segment) => {
      const text = String(segment?.text || '').trim()
      if (!text) return null

      const startRaw = Number(segment?.startSec)
      return {
        startSec: Number.isFinite(startRaw) && startRaw >= 0 ? startRaw : null,
        text,
      }
    })
    .filter(Boolean)

  if (normalized.length === 0) {
    return []
  }

  const merged = []
  let current = { ...normalized[0] }

  for (let i = 1; i < normalized.length; i += 1) {
    const next = normalized[i]
    const canCompareByTime = Number.isFinite(current.startSec) && Number.isFinite(next.startSec)
    const span = canCompareByTime ? next.startSec - current.startSec : 0

    if (canCompareByTime && span > maxWindow) {
      merged.push(current)
      current = { ...next }
      continue
    }

    current = {
      startSec: current.startSec,
      text: `${current.text} ${next.text}`.trim(),
    }
  }

  merged.push(current)
  return merged
}

function normalizeExportSegments(segments = []) {
  return segments
    .map((segment) => {
      const text = String(segment?.text || '').trim()
      if (!text) return null

      const startRaw = Number(segment?.startSec)
      return {
        startSec: Number.isFinite(startRaw) && startRaw >= 0 ? startRaw : 0,
        text,
      }
    })
    .filter(Boolean)
}

function formatSrtTimestamp(seconds) {
  const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  const totalMilliseconds = Math.round(safeSeconds * 1000)
  const hours = Math.floor(totalMilliseconds / 3600000)
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000)
  const secs = Math.floor((totalMilliseconds % 60000) / 1000)
  const millis = totalMilliseconds % 1000

  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':') +
    `,${String(millis).padStart(3, '0')}`
}

export function buildSrtContent(segments = [], options = {}) {
  const fallbackDurationSec =
    Number.isFinite(options.fallbackDurationSec) && options.fallbackDurationSec > 0
      ? options.fallbackDurationSec
      : 2
  const normalized = normalizeExportSegments(segments)

  if (normalized.length === 0) {
    return ''
  }

  return normalized
    .map((segment, index) => {
      const nextSegment = normalized[index + 1]
      const nextStartSec = Number(nextSegment?.startSec)
      const hasValidNextStart = Number.isFinite(nextStartSec) && nextStartSec > segment.startSec
      const endSec = hasValidNextStart ? nextStartSec : segment.startSec + fallbackDurationSec

      return [
        String(index + 1),
        `${formatSrtTimestamp(segment.startSec)} --> ${formatSrtTimestamp(endSec)}`,
        segment.text,
      ].join('\n')
    })
    .join('\n\n')
}
