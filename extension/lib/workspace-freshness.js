function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function hashText(value) {
  const text = normalizeText(value)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

export function buildWorkspaceSourceSignature(context = {}, videoInfo = null) {
  if (context?.sourceType === 'webpage') {
    const contentText = normalizeText(context?.contentText)
    const focusText = normalizeText(context?.focusText)
    return [
      'webpage',
      normalizeText(context?.pageKey),
      normalizeText(context?.title),
      contentText.length,
      focusText.length,
      hashText(contentText),
      hashText(focusText),
    ].join('::')
  }

  if (context?.sourceType === 'youtube') {
    return [
      'youtube',
      normalizeText(context?.videoId || videoInfo?.videoId),
      normalizeText(context?.title || videoInfo?.title),
    ].join('::')
  }

  return ''
}

export function isWorkspaceSnapshotStale({ snapshotSignature = '', context = {}, videoInfo = null } = {}) {
  const currentSignature = buildWorkspaceSourceSignature(context, videoInfo)
  if (!snapshotSignature || !currentSignature) return false
  return snapshotSignature !== currentSignature
}
