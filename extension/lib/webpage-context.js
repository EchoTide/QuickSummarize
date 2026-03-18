function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  try {
    return new URL(rawUrl).toString()
  } catch {
    return ''
  }
}

function hostnameFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname || ''
  } catch {
    return ''
  }
}

function buildPageKey(url, canonicalUrl) {
  return normalizeUrl(canonicalUrl) || normalizeUrl(url)
}

export function isRestrictedPageUrl(rawUrl) {
  const value = String(rawUrl || '').trim().toLowerCase()
  if (!value) return true
  if (value.startsWith('chrome://')) return true
  if (value.startsWith('edge://')) return true
  if (value.startsWith('about:')) return true
  if (value.startsWith('chrome-extension://')) return true
  return value.startsWith('https://chromewebstore.google.com/') || value.startsWith('https://chrome.google.com/webstore/')
}

export function buildWebpageContext(input = {}) {
  const title = normalizeText(input.title)
  const url = normalizeUrl(input.url)
  const canonicalUrl = normalizeUrl(input.canonicalUrl)

  if (!url || isRestrictedPageUrl(url)) {
    return { success: false, error: 'UNSUPPORTED_PAGE' }
  }

  const selectionText = normalizeText(input.selectionText)
  const articleText = normalizeText(input.articleText)
  const mainText = normalizeText(input.mainText)
  const bodyText = normalizeText(input.bodyText)
  const contentText = articleText || mainText || bodyText

  if (!contentText) {
    return { success: false, error: 'EMPTY_CONTENT' }
  }

  return {
    success: true,
    data: {
      sourceType: 'webpage',
      title: title || hostnameFromUrl(url) || 'Untitled page',
      url,
      canonicalUrl: canonicalUrl || url,
      hostname: hostnameFromUrl(url),
      pageKey: buildPageKey(url, canonicalUrl),
      selectionText,
      contentText,
      focusType: selectionText ? 'selection' : 'page',
      focusText: selectionText || contentText,
      extractState: 'ready',
    },
  }
}
