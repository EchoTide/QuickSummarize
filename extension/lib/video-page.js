function isYouTubeHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'youtube.com' || host.endsWith('.youtube.com')
}

export function extractVideoIdFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''

  try {
    const parsed = new URL(rawUrl)
    if (!isYouTubeHost(parsed.hostname)) return ''

    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v') || ''
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) {
      return shortsMatch[1]
    }
  } catch {
    return ''
  }

  return ''
}

export function isYouTubeVideoUrl(rawUrl) {
  return Boolean(extractVideoIdFromUrl(rawUrl))
}
