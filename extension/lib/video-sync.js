export function normalizeVideoInfo(raw) {
  const videoId = String(raw?.videoId || '').trim()
  const title = String(raw?.title || '').trim()
  return { videoId, title }
}

export function hasVideoChanged(prev, next) {
  const prevId = normalizeVideoInfo(prev).videoId
  const nextId = normalizeVideoInfo(next).videoId

  if (!nextId) return false
  return prevId !== nextId
}
