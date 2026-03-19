import { parseTranscriptDetailedResponse } from './lib/transcript.js'
import { fetchTranscriptForVideo } from './lib/transcript-source.js'
import { extractVideoIdFromUrl } from './lib/video-page.js'
import { normalizeLanguage, nextLanguage, getLanguageToggleLabel } from './lib/i18n.js'
import { loadConfig } from './lib/storage.js'
import { installSelectionTranslation } from './lib/selection-translate.js'
import { sendRuntimeMessageSafely } from './lib/runtime-message.js'

const PAGE_HOOK_CHANNEL = 'QUICK_SUMMARIZE_TIMEDTEXT'
const INPAGE_PANEL_ROOT_ID = '__qs-inpage-panel-root'
const URL_CHANGE_EVENT = '__qs_url_change__'
const IFRAME_BRIDGE_SOURCE = 'QUICK_SUMMARIZE_IFRAME'
const IFRAME_MIN_HEIGHT = 196
const IFRAME_MAX_HEIGHT = 760
const MAX_TIMEDTEXT_CACHE = 20
const MAX_TRACK_URL_CACHE = 40
const timedtextResponseCache = []
const captionTrackUrlCache = []
const prefetchCooldownCache = new Map()

let currentVideoId = null
let inPageFrameBridgeInstalled = false
let uiLanguage = 'en'

const UI_TEXT = {
  en: {
    unknownVideo: 'Unknown video',
    collapse: 'Collapse',
    expand: 'Expand',
    switchLanguage: 'Switch language',
  },
  zh: {
    unknownVideo: '未知视频',
    collapse: '收起',
    expand: '展开',
    switchLanguage: '切换语言',
  },
}

function getUiText(key) {
  const table = UI_TEXT[uiLanguage] || UI_TEXT.en
  return table[key] || UI_TEXT.en[key] || key
}

function updateInPagePanelLocale() {
  const root = document.getElementById(INPAGE_PANEL_ROOT_ID)
  const toggle = root?.shadowRoot?.querySelector('.qs-toggle')
  const langToggle = root?.shadowRoot?.querySelector('.qs-lang-toggle')
  const dock = root?.shadowRoot?.querySelector('.qs-dock')
  if (!toggle || !dock || !langToggle) return

  const collapsed = dock.classList.contains('collapsed')
  toggle.textContent = collapsed ? getUiText('expand') : getUiText('collapse')
  toggle.setAttribute('aria-label', collapsed ? getUiText('expand') : getUiText('collapse'))
  langToggle.textContent = getLanguageToggleLabel(uiLanguage)
  langToggle.setAttribute('aria-label', getUiText('switchLanguage'))
  langToggle.setAttribute('title', getUiText('switchLanguage'))
}

async function loadUiLanguage() {
  try {
    const result = await chrome.storage.local.get(['language'])
    uiLanguage = normalizeLanguage(result.language)
  } catch {
    uiLanguage = 'en'
  }
  updateInPagePanelLocale()
}

async function switchUiLanguage() {
  uiLanguage = nextLanguage(uiLanguage)
  updateInPagePanelLocale()

  try {
    await chrome.storage.local.set({ language: uiLanguage })
  } catch {
    // ignore persist failures and keep in-memory language
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function applyInPageFrameHeight(frame, rawHeight) {
  const numericHeight = Number(rawHeight)
  if (!Number.isFinite(numericHeight)) return
  const height = clamp(Math.round(numericHeight), IFRAME_MIN_HEIGHT, IFRAME_MAX_HEIGHT)
  frame.style.height = `${height}px`
}

function installInPageFrameBridge() {
  if (inPageFrameBridgeInstalled) return
  inPageFrameBridgeInstalled = true

  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.source !== IFRAME_BRIDGE_SOURCE || data.type !== 'RESIZE') return

    const root = document.getElementById(INPAGE_PANEL_ROOT_ID)
    const frame = root?.shadowRoot?.querySelector('.qs-frame')
    if (!frame) return

    applyInPageFrameHeight(frame, data.height)
  })
}

function getVideoId() {
  return extractVideoIdFromUrl(window.location.href) || null
}

function getVideoTitle() {
  const selectors = [
    'yt-formatted-string.style-scope.ytd-watch-metadata',
    'h1.ytd-video-primary-info-renderer',
    'yt-formatted-string.ytd-video-renderer',
    '#title > h1',
    'h1.ytd-watch-metadata',
  ]

  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) {
      return el.textContent.trim()
    }
  }

  return document.title || getUiText('unknownVideo')
}

function resolveInPagePanelMountPoint() {
  const selectors = [
    'ytd-watch-flexy #secondary #secondary-inner',
    'ytd-watch-flexy #secondary-inner',
    'ytd-watch-flexy #secondary',
    'ytd-watch-flexy #below',
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element) return element
  }

  return null
}

function mountInPagePanel(root) {
  const mountPoint = resolveInPagePanelMountPoint()
  if (!mountPoint) return false

  if (root.parentElement !== mountPoint) {
    if (mountPoint.firstElementChild) {
      mountPoint.insertBefore(root, mountPoint.firstElementChild)
    } else {
      mountPoint.appendChild(root)
    }
  }

  return true
}

function ensureInPagePanel() {
  let root = document.getElementById(INPAGE_PANEL_ROOT_ID)
  if (root) return root

  root = document.createElement('div')
  root.id = INPAGE_PANEL_ROOT_ID
  root.style.display = 'block'
  root.style.width = '100%'
  root.style.minWidth = '0'
  root.style.marginBottom = '12px'
  root.style.boxSizing = 'border-box'

  const shadow = root.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      .qs-dock {
        width: 100%;
        min-width: 0;
        background: linear-gradient(165deg, #ffffff 0%, #f7f9ff 100%);
        border-radius: 14px;
        border: 1px solid rgba(16, 22, 36, 0.12);
        box-shadow: 0 10px 28px rgba(15, 20, 35, 0.14);
        overflow: hidden;
        font-family: 'Sora', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }

      .qs-header {
        height: 38px;
        background: linear-gradient(92deg, #11141c, #1e2331);
        color: #f7f8fb;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px 0 12px;
        gap: 10px;
      }

      .qs-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .qs-logo-badge {
        width: 24px;
        height: 24px;
        border-radius: 8px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 8px 16px rgba(99, 102, 241, 0.22);
      }

      .qs-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .qs-body {
        width: 100%;
        background: transparent;
      }

      .qs-toggle {
        min-width: 48px;
        height: 24px;
        padding: 0 9px;
        border: none;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }

      .qs-toggle:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .qs-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .qs-lang-toggle {
        min-width: 34px;
        height: 24px;
        padding: 0 8px;
        border: none;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.03em;
        cursor: pointer;
      }

      .qs-lang-toggle:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .qs-frame {
        width: 100%;
        height: 252px;
        border: none;
        background: #fff;
        display: block;
        transition: height 0.18s ease;
      }

      .qs-dock.collapsed .qs-body {
        display: none;
      }

      @media (max-width: 1200px) {
        .qs-frame {
          height: 230px;
        }
      }
    </style>
    <section class="qs-dock">
      <header class="qs-header">
        <div class="qs-title-wrap">
          <span class="qs-logo-badge" aria-hidden="true">Q</span>
          <span class="qs-title">QuickSummarize</span>
        </div>
        <div class="qs-actions">
          <button type="button" class="qs-lang-toggle" aria-label="Switch language" title="Switch language">ZH</button>
          <button type="button" class="qs-toggle" aria-label="Collapse">Collapse</button>
        </div>
      </header>
      <div class="qs-body">
        <iframe class="qs-frame" title="QuickSummarize Panel"></iframe>
      </div>
    </section>
  `

  const dock = shadow.querySelector('.qs-dock')
  const toggle = shadow.querySelector('.qs-toggle')
  const langToggle = shadow.querySelector('.qs-lang-toggle')
  const frame = shadow.querySelector('.qs-frame')

  frame.src = chrome.runtime.getURL('sidepanel.html?embed=1')
  installInPageFrameBridge()
  applyInPageFrameHeight(frame, 252)

  toggle?.addEventListener('click', () => {
    const collapsed = dock.classList.toggle('collapsed')
    toggle.textContent = collapsed ? getUiText('expand') : getUiText('collapse')
    toggle.setAttribute('aria-label', toggle.textContent)
  })

  langToggle?.addEventListener('click', () => {
    switchUiLanguage()
  })

  ;(document.body || document.documentElement).appendChild(root)
  updateInPagePanelLocale()
  return root
}

function setInPagePanelVisible(visible) {
  const root = ensureInPagePanel()
  const mounted = mountInPagePanel(root)
  root.style.display = visible && mounted ? 'block' : 'none'
}

function scheduleVideoRefresh() {
  currentVideoId = null
  setInPagePanelVisible(Boolean(getVideoId()))
  setTimeout(checkForVideo, 60)
  setTimeout(checkForVideo, 420)
  setTimeout(checkForVideo, 1200)
}

function installHistoryChangeHook() {
  if (window.__qsHistoryHookInstalled) return
  window.__qsHistoryHookInstalled = true

  const notifyChange = () => {
    window.dispatchEvent(new Event(URL_CHANGE_EVENT))
  }

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method]
    if (typeof original !== 'function') continue

    history[method] = function patchedHistory(...args) {
      const result = original.apply(this, args)
      notifyChange()
      return result
    }
  }
}

function injectPageHook() {
  if (document.getElementById('__qs-page-hook')) return

  const script = document.createElement('script')
  script.id = '__qs-page-hook'
  script.src = chrome.runtime.getURL('page-hook.js')
  script.async = false
  script.onload = () => script.remove()
  script.onerror = () => script.remove()

  ;(document.head || document.documentElement).appendChild(script)
}

function cacheTimedtextResponse(url, text, ts = Date.now()) {
  if (!url || typeof url !== 'string' || typeof text !== 'string') return

  timedtextResponseCache.unshift({
    url,
    text,
    ts: Number(ts || Date.now()),
  })

  if (timedtextResponseCache.length > MAX_TIMEDTEXT_CACHE) {
    timedtextResponseCache.length = MAX_TIMEDTEXT_CACHE
  }
}

function cacheCaptionTrackUrls(urls, ts = Date.now()) {
  if (!Array.isArray(urls)) return

  for (const url of urls) {
    if (!url || typeof url !== 'string') continue

    captionTrackUrlCache.unshift({
      url,
      ts: Number(ts || Date.now()),
    })
  }

  if (captionTrackUrlCache.length > MAX_TRACK_URL_CACHE) {
    captionTrackUrlCache.length = MAX_TRACK_URL_CACHE
  }
}

function postToPageHook(type, payload = {}) {
  try {
    window.postMessage({ source: PAGE_HOOK_CHANNEL, type, payload }, '*')
  } catch {
    // ignore post message errors
  }
}

function postAndWaitForPageHook(type, payload = {}, expectedTypes = [], timeoutMs = 800) {
  return new Promise((resolve) => {
    let done = false
    let timer = null

    const finish = (value) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      if (timer) clearTimeout(timer)
      resolve(value)
    }

    const onMessage = (event) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== PAGE_HOOK_CHANNEL) return
      if (expectedTypes.includes(data.type)) {
        finish(data)
      }
    }

    window.addEventListener('message', onMessage)
    timer = setTimeout(() => finish(null), timeoutMs)
    postToPageHook(type, payload)
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForTimedtextActivity(videoId, timeoutMs = 3200, intervalMs = 160) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const cached = getCachedTranscript(videoId)
    if (cached) return { hit: 'cached' }

    const urls = getRecentTimedtextUrls(videoId)
    if (urls.length > 0) return { hit: 'seed-url' }

    await sleep(intervalMs)
  }

  return { hit: null }
}

async function runTimedtextPrefetch(videoId, targetLanguage = uiLanguage) {
  const normalizedLanguage = normalizeLanguage(targetLanguage)
  const cooldownKey = `${videoId}:${normalizedLanguage}`
  const now = Date.now()
  const lastRunAt = Number(prefetchCooldownCache.get(cooldownKey) || 0)
  if (now - lastRunAt < 8000) {
    await waitForTimedtextActivity(videoId, 2500, 160)
    return
  }
  prefetchCooldownCache.set(cooldownKey, now)

  const result = await postAndWaitForPageHook(
    'PREFETCH_TIMEDTEXT',
    {
      videoId,
      targetLanguage: normalizedLanguage,
    },
    ['PREFETCH_TIMEDTEXT_RESULT'],
    1200
  )

  console.debug('[QuickSummarize][content] prefetch result', result?.payload || null)

  const warmup = await waitForTimedtextActivity(videoId, 7000, 160)
  console.debug('[QuickSummarize][content] prefetch warmup', warmup)

  await postAndWaitForPageHook(
    'REQUEST_CAPTION_TRACKS',
    { videoId },
    ['CAPTION_TRACK_URLS'],
    700
  )
}

function getPreferredLanguagesForUiLanguage(language) {
  const normalized = normalizeLanguage(language)
  if (normalized === 'zh') {
    return ['zh-CN', 'zh-Hans', 'zh-Hant', 'zh', 'en']
  }
  return ['en', 'en-US', 'en-GB', 'zh-CN', 'zh-Hans', 'zh']
}

function clearCachedTimedtextForVideo(videoId) {
  if (!videoId) return

  const keepTimedtext = timedtextResponseCache.filter((entry) => {
    try {
      return new URL(entry.url).searchParams.get('v') !== videoId
    } catch {
      return true
    }
  })
  timedtextResponseCache.length = 0
  timedtextResponseCache.push(...keepTimedtext)

  const keepTracks = captionTrackUrlCache.filter((entry) => {
    try {
      return new URL(entry.url).searchParams.get('v') !== videoId
    } catch {
      return true
    }
  })
  captionTrackUrlCache.length = 0
  captionTrackUrlCache.push(...keepTracks)
}

async function switchCaptionLanguageOnPage(targetLanguage = uiLanguage) {
  const normalizedLanguage = normalizeLanguage(targetLanguage)
  uiLanguage = normalizedLanguage
  const videoId = getVideoId()
  if (!videoId) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  clearCachedTimedtextForVideo(videoId)

  const result = await postAndWaitForPageHook(
    'SWITCH_CAPTION_LANGUAGE',
    { videoId, targetLanguage: normalizedLanguage },
    ['CAPTION_LANGUAGE_SWITCH_RESULT'],
    1200
  )

  await runTimedtextPrefetch(videoId, normalizedLanguage)
  return { success: true, payload: result?.payload || null }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== PAGE_HOOK_CHANNEL) return

  if (data.type === 'TIMEDTEXT_RESPONSE') {
    const payload = data.payload || {}
    cacheTimedtextResponse(payload.url, payload.text, payload.ts)
    console.debug('[QuickSummarize][content] intercepted timedtext response', {
      url: payload.url || '',
      length: String(payload.text || '').length,
    })
    return
  }

  if (data.type === 'CAPTION_TRACK_URLS') {
    const payload = data.payload || {}
    cacheCaptionTrackUrls(payload.urls, payload.ts)
    console.debug('[QuickSummarize][content] received caption track urls', {
      videoId: payload.videoId || '',
      reason: payload.reason || '',
      count: Array.isArray(payload.urls) ? payload.urls.length : 0,
    })
    return
  }

  if (data.type === 'PREFETCH_TIMEDTEXT_RESULT') {
    console.debug('[QuickSummarize][content] PREFETCH_TIMEDTEXT_RESULT', data.payload || null)
  }
})

function isTrackUrlMatchingLanguage(url, language) {
  try {
    const parsed = new URL(url)
    const lang = normalizeLanguage(parsed.searchParams.get('lang'))
    const target = normalizeLanguage(language)
    if (!lang || !target) return true

    if (target === 'zh') {
      return lang === 'zh' || lang.startsWith('zh-')
    }

    if (target === 'en') {
      return lang === 'en' || lang.startsWith('en-')
    }

    return true
  } catch {
    return true
  }
}

function getCachedTranscript(videoId, language = uiLanguage, options = {}) {
  const { matchLanguage = true } = options
  if (!videoId) return null

  for (const entry of timedtextResponseCache) {
    try {
      const parsed = new URL(entry.url)
      if (parsed.searchParams.get('v') !== videoId) continue
      if (matchLanguage && !isTrackUrlMatchingLanguage(entry.url, language)) continue

      const parsedTranscript = parseTranscriptDetailedResponse(entry.text)
      if (parsedTranscript.text) {
        return {
          text: parsedTranscript.text,
          segments: parsedTranscript.segments,
          url: entry.url,
        }
      }
    } catch {
      // ignore malformed URL
    }
  }

  return null
}

function getRecentTimedtextUrls(videoId) {
  if (!videoId || typeof performance === 'undefined' || !performance.getEntriesByType) {
    return []
  }

  const timedtextUrls = []

  for (const entry of timedtextResponseCache) {
    try {
      const parsed = new URL(entry.url)
      if (parsed.searchParams.get('v') !== videoId) continue
      timedtextUrls.push({
        url: parsed.toString(),
        responseEnd: Number(entry.ts || 0),
      })
    } catch {
      // ignore malformed URL
    }
  }

  for (const entry of captionTrackUrlCache) {
    try {
      const parsed = new URL(entry.url)
      if (parsed.searchParams.get('v') !== videoId) continue
      timedtextUrls.push({
        url: parsed.toString(),
        responseEnd: Number(entry.ts || 0),
      })
    } catch {
      // ignore malformed URL
    }
  }

  const entries = performance.getEntriesByType('resource') || []

  for (const entry of entries) {
    const name = entry?.name
    if (!name || typeof name !== 'string') continue
    if (!name.includes('/api/timedtext')) continue

    try {
      const parsed = new URL(name)
      if (parsed.searchParams.get('v') !== videoId) continue
      timedtextUrls.push({
        url: parsed.toString(),
        responseEnd: Number(entry.responseEnd || 0),
      })
    } catch {
      // ignore malformed URL
    }
  }

  return [...new Set(timedtextUrls.sort((a, b) => b.responseEnd - a.responseEnd).map((x) => x.url))].slice(0, 8)
}

function getObservedTimedtextUrls(videoId) {
  if (!videoId) return []

  const timedtextUrls = []

  for (const entry of timedtextResponseCache) {
    try {
      const parsed = new URL(entry.url)
      if (parsed.searchParams.get('v') !== videoId) continue
      timedtextUrls.push({
        url: parsed.toString(),
        responseEnd: Number(entry.ts || 0),
      })
    } catch {
      // ignore malformed URL
    }
  }

  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    const entries = performance.getEntriesByType('resource') || []
    for (const entry of entries) {
      const name = entry?.name
      if (!name || typeof name !== 'string' || !name.includes('/api/timedtext')) continue

      try {
        const parsed = new URL(name)
        if (parsed.searchParams.get('v') !== videoId) continue
        timedtextUrls.push({
          url: parsed.toString(),
          responseEnd: Number(entry.responseEnd || 0),
        })
      } catch {
        // ignore malformed URL
      }
    }
  }

  return [...new Set(timedtextUrls.sort((a, b) => b.responseEnd - a.responseEnd).map((x) => x.url))].slice(0, 8)
}

async function fetchTranscriptByTrackUrl(trackUrls, language = uiLanguage) {
  const urls = Array.isArray(trackUrls) ? trackUrls.filter((url) => typeof url === 'string' && url) : []
  if (urls.length === 0) {
    return { success: false, error: 'NO_CAPTIONS' }
  }

  const prioritizedUrls = [
    ...urls.filter((url) => isTrackUrlMatchingLanguage(url, language)),
    ...urls.filter((url) => !isTrackUrlMatchingLanguage(url, language)),
  ]

  for (const url of prioritizedUrls) {
    try {
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) continue

      const text = await response.text()
      cacheTimedtextResponse(url, text, Date.now())

      const parsedTranscript = parseTranscriptDetailedResponse(text)
      if (parsedTranscript.text) {
        return {
          success: true,
          text: parsedTranscript.text,
          segments: parsedTranscript.segments,
        }
      }
    } catch {
      // try next caption track url
    }
  }

  return { success: false, error: 'NO_CAPTIONS' }
}

async function fetchTranscript(language = uiLanguage) {
  const videoId = getVideoId()
  if (!videoId) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  try {
    const config = await loadConfig()
    const allowAutomation = Boolean(config.autoOpenCaptions)
    await postAndWaitForPageHook('REQUEST_CAPTION_TRACKS', { videoId }, ['CAPTION_TRACK_URLS'], 700)

    return await fetchTranscriptForVideo(videoId, language, {
      getCachedTranscript,
      runTimedtextPrefetch: allowAutomation ? runTimedtextPrefetch : undefined,
      waitForTimedtextActivity,
      getRecentTimedtextUrls: allowAutomation ? getRecentTimedtextUrls : getObservedTimedtextUrls,
      fetchTranscriptByTrackUrl,
      allowAutomation,
    })
  } catch {
    return { success: false, error: 'FETCH_FAILED' }
  }
}

async function fetchOriginalTranscript(language = uiLanguage) {
  const videoId = getVideoId()
  if (!videoId) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  try {
    const config = await loadConfig()
    const allowAutomation = Boolean(config.autoOpenCaptions)
    if (allowAutomation) {
      await postAndWaitForPageHook('REQUEST_CAPTION_TRACKS', { videoId }, ['CAPTION_TRACK_URLS'], 700)
      await runTimedtextPrefetch(videoId, language)
    }

    const cached = getCachedTranscript(videoId, language, { matchLanguage: false })
    if (cached) {
      return {
        success: true,
        text: cached.text,
        segments: cached.segments,
      }
    }

    return { success: false, error: 'MANUAL_CAPTIONS_REQUIRED' }
  } catch {
    return { success: false, error: 'FETCH_FAILED' }
  }
}

async function checkForVideo() {
  const videoId = getVideoId()
  setInPagePanelVisible(Boolean(videoId))

  if (!videoId || videoId === currentVideoId) return

  currentVideoId = videoId
  const title = getVideoTitle()

  sendRuntimeMessageSafely({
    type: 'VIDEO_DETECTED',
    data: { videoId, title },
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_TRANSCRIPT_V2' || message.type === 'REQUEST_TRANSCRIPT') {
    if (message.preferOriginal) {
      fetchOriginalTranscript(message.language)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({
          success: false,
          error: error?.message || 'FETCH_FAILED',
        }))
      return true
    }

    fetchTranscript(message.language)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        success: false,
        error: error?.message || 'FETCH_FAILED',
      }))
    return true
  }

  if (message.type === 'SWITCH_CAPTION_LANGUAGE') {
    switchCaptionLanguageOnPage(message.language)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        success: false,
        error: error?.message || 'FETCH_FAILED',
      }))
    return true
  }

  if (message.type === 'SEEK_TO') {
    const video = document.querySelector('video')
    const seconds = Number(message.seconds)

    if (!video || !Number.isFinite(seconds)) {
      sendResponse({ success: false })
      return true
    }

    video.currentTime = Math.max(0, seconds)
    sendResponse({ success: true })
    return true
  }

  if (message.type === 'REQUEST_VIDEO_INFO') {
    const videoId = getVideoId()

    if (!videoId) {
      sendResponse({ success: false })
      return true
    }

    const data = { videoId, title: getVideoTitle() }
    sendResponse({ success: true, data })

    sendRuntimeMessageSafely({
      type: 'VIDEO_DETECTED',
      data,
    })

    return true
  }
})

let lastUrl = location.href

function onUrlMaybeChanged() {
  if (location.href === lastUrl) return
  lastUrl = location.href
  scheduleVideoRefresh()
}

const observer = new MutationObserver(() => {
  onUrlMaybeChanged()
})

observer.observe(document.body, { childList: true, subtree: true })

window.addEventListener('popstate', () => {
  onUrlMaybeChanged()
})

window.addEventListener('hashchange', () => {
  onUrlMaybeChanged()
})

window.addEventListener(URL_CHANGE_EVENT, () => {
  onUrlMaybeChanged()
})

window.addEventListener('yt-navigate-finish', () => {
  onUrlMaybeChanged()
  setTimeout(checkForVideo, 900)
})

setInterval(() => {
  checkForVideo()
}, 5000)

installHistoryChangeHook()
injectPageHook()
loadUiLanguage()
installSelectionTranslation({ loadConfig })

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.language) return
    uiLanguage = normalizeLanguage(changes.language.newValue)
    updateInPagePanelLocale()
  })
}

setTimeout(checkForVideo, 2000)
