import { buildWebpageContext, isRestrictedPageUrl } from './lib/webpage-context.js'

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function getSelectionText() {
  try {
    return normalizeText(window.getSelection?.()?.toString?.() || '')
  } catch {
    return ''
  }
}

function collectTextFromSelectors(selectors = []) {
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    const text = normalizeText(element?.innerText || element?.textContent || '')
    if (text) return text
  }
  return ''
}

function getCanonicalUrl() {
  const element = document.querySelector('link[rel="canonical"]')
  const href = element?.getAttribute('href') || ''
  if (!href) return ''

  try {
    return new URL(href, window.location.href).toString()
  } catch {
    return ''
  }
}

function requestPageContext() {
  const url = window.location.href
  if (isRestrictedPageUrl(url)) {
    return { success: false, error: 'UNSUPPORTED_PAGE' }
  }

  return buildWebpageContext({
    title: document.title,
    url,
    canonicalUrl: getCanonicalUrl(),
    selectionText: getSelectionText(),
    articleText: collectTextFromSelectors(['article', '[role="article"]', '.article-content', '.post-content']),
    mainText: collectTextFromSelectors(['main', '[role="main"]', '.main-content']),
    bodyText: normalizeText(document.body?.innerText || document.body?.textContent || ''),
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'REQUEST_PAGE_CONTEXT') return undefined
  sendResponse(requestPageContext())
  return true
})
