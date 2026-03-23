import { loadConfig, saveConfig, isConfigured } from './lib/storage.js'
import { streamSummarize, streamChatReply } from './lib/llm.js'
import { hasVideoChanged, normalizeVideoInfo } from './lib/video-sync.js'
import { measureEmbedHeight } from './lib/embed-resize.js'
import { normalizeLanguage, nextLanguage, getLanguageToggleLabel } from './lib/i18n.js'
import { mergeSubtitleSegments, buildSrtContent } from './lib/subtitles.js'
import { summarizeTimelineChunks } from './lib/timeline-summary.js'
import {
  createVideoChatSession,
  createPageChatSession,
  syncPageChatSession,
  appendTranscriptSnapshot,
  appendPageSnapshot,
  addChatTurn,
  compactSessionTurns,
} from './lib/chat-session.js'
import { chunkTranscriptSegments, chunkPageText } from './lib/chat-context.js'
import { syncVideoChatSession } from './lib/video-chat-controller.js'
import { runVideoChatAgentTurn } from './lib/video-chat-agent.js'
import { runPageChatAgentTurn } from './lib/page-chat-agent.js'
import { renderChatContent, getChatRoleLabel, getChatCopyLabel } from './lib/chat-render.js'
import { getWorkspaceCapabilities, getSourceLabels, resolveWorkspaceSourceType } from './lib/workspace-mode.js'
import { resolveActivePageContext } from './lib/page-context-resolver.js'
import { createWorkspaceSessionCache } from './lib/workspace-session-cache.js'
import { buildWorkspaceSourceSignature, isWorkspaceSnapshotStale } from './lib/workspace-freshness.js'
import {
  loadWorkspaceSessionSnapshot,
  saveWorkspaceSessionSnapshot,
  clearWorkspaceSessionTab,
  clearWorkspaceSessionStore,
} from './lib/workspace-session-store.js'
import { marked } from 'marked'

const IFRAME_BRIDGE_SOURCE = 'QUICK_SUMMARIZE_IFRAME'

const states = {
  unconfigured: document.getElementById('state-unconfigured'),
  noVideo: document.getElementById('state-no-video'),
  workspace: document.getElementById('state-workspace'),
  ready: document.getElementById('state-ready'),
  loading: document.getElementById('state-loading'),
  done: document.getElementById('state-done'),
  subtitles: document.getElementById('state-subtitles'),
  error: document.getElementById('state-error'),
}

const workspaceVideoTitleEl = document.getElementById('workspace-video-title')
const videoTitleEl = workspaceVideoTitleEl
const videoTitleLoadingEl = workspaceVideoTitleEl
const videoTitleDoneEl = workspaceVideoTitleEl
const videoTitleSubtitlesEl = workspaceVideoTitleEl
const summaryOutputEl = document.getElementById('summary-output')
const summaryResultEl = document.getElementById('summary-result')
const subtitlesListEl = document.getElementById('subtitles-list')
const errorMsgEl = document.getElementById('error-msg')
const loadingIndicatorEl = document.getElementById('loading-indicator')
const loadingSkeletonEl = document.getElementById('loading-skeleton')
const unconfiguredTextEl = document.getElementById('state-unconfigured-text')
const unconfiguredBodyEl = document.getElementById('state-unconfigured-body')
const noVideoTextEl = document.getElementById('state-no-video-text')
const noVideoBodyEl = document.getElementById('state-no-video-body')
const noVideoRetryBtnEl = document.getElementById('no-video-retry-btn')
const loadingLabelEl = document.getElementById('loading-label')
const openOptionsEl = document.getElementById('open-options')
const openOptionsIconEl = document.getElementById('open-options-icon')
const langToggleBtnEl = document.getElementById('lang-toggle-btn')
const summarizeBtnEl = document.getElementById('summarize-btn')
const viewSubtitlesBtnEl = document.getElementById('view-subtitles-btn')
const exportSubtitlesBtnEl = document.getElementById('export-subtitles-btn')
const cancelBtnEl = document.getElementById('cancel-btn')
const copyBtnEl = document.getElementById('copy-btn')
const doneSubtitlesBtnEl = document.getElementById('done-subtitles-btn')
const doneExportSubtitlesBtnEl = document.getElementById('done-export-subtitles-btn')
const retryBtnEl = document.getElementById('retry-btn')
const summaryRefreshNoticeEl = document.getElementById('summary-refresh-notice')
const summaryRefreshTitleEl = document.getElementById('summary-refresh-title')
const summaryRefreshBodyEl = document.getElementById('summary-refresh-body')
const summaryRefreshBtnEl = document.getElementById('summary-refresh-btn')
const errorRetryBtnEl = document.getElementById('error-retry-btn')
const subtitlesRefreshBtnEl = document.getElementById('subtitles-refresh-btn')
const subtitlesBackBtnEl = document.getElementById('subtitles-back-btn')
const workspaceTabSummaryEl = document.getElementById('workspace-tab-summary')
const workspaceTabChatEl = document.getElementById('workspace-tab-chat')
const workspaceTabTimelineEl = document.getElementById('workspace-tab-timeline')
const workspaceTabSummaryTitleEl = document.getElementById('workspace-tab-summary-title')
const workspaceTabChatTitleEl = document.getElementById('workspace-tab-chat-title')
const workspaceTabTimelineTitleEl = document.getElementById('workspace-tab-timeline-title')
const workspaceVideoEyebrowEl = document.getElementById('workspace-video-eyebrow')
const workspaceLanguageLabelEl = document.getElementById('workspace-language-label')
const workspaceTranscriptLabelEl = document.getElementById('workspace-transcript-label')
const workspaceTabChatSubtitleEl = document.getElementById('workspace-tab-chat-subtitle')
const workspaceTabSummarySubtitleEl = document.getElementById('workspace-tab-summary-subtitle')
const workspaceTabTimelineSubtitleEl = document.getElementById('workspace-tab-timeline-subtitle')
const workspacePanelSummaryEl = document.getElementById('workspace-panel-summary')
const workspacePanelChatEl = document.getElementById('workspace-panel-chat')
const workspacePanelTimelineEl = document.getElementById('workspace-panel-timeline')
const workspaceLanguagePillEl = document.getElementById('workspace-language-pill')
const workspaceTranscriptPillEl = document.getElementById('workspace-transcript-pill')
const chatMessagesEl = document.getElementById('chat-messages')
const chatFormEl = document.getElementById('chat-form')
const chatInputLabelEl = document.getElementById('chat-input-label')
const chatInputEl = document.getElementById('chat-input')
const chatSendBtnEl = document.getElementById('chat-send-btn')
const chatRestartBtnEl = document.getElementById('chat-restart-btn')
const errorTitleEl = document.getElementById('state-error-title')

const exportButtons = [exportSubtitlesBtnEl, doneExportSubtitlesBtnEl].filter(Boolean)

let currentVideoInfo = null
let currentPageContext = { sourceType: 'unsupported', error: 'UNSUPPORTED_PAGE', title: '', url: '' }
let abortController = null
let abortReason = ''
let syncTimer = null
let navigationListenersInstalled = false
let resizeScheduled = false
let currentLanguage = 'en'
let currentTabId = 0
let previousStateBeforeSubtitles = 'ready'
let currentWorkspaceTab = 'summary'
let subtitlesLoading = false
let subtitlesExporting = false
let workspaceSnapshotStale = false
let workspaceContentBasisSignature = ''
let subtitlesRequestToken = 0
let lastRequestedMode = 'summary'
let lastFailedMode = 'summary'
let lastErrorCode = ''
let chatAbortController = null
let persistSnapshotTimer = null
let videoChatSession = createVideoChatSession({ videoId: '', language: 'en' })
let pageChatSession = createPageChatSession({ pageKey: '', language: 'en' })
let subtitleCache = {
  videoId: '',
  language: 'en',
  transcriptText: '',
  segments: [],
  mergedSegments: [],
  timelineByLanguage: {},
  timelinePendingByLanguage: {},
}
const workspaceSessionCache = createWorkspaceSessionCache({ maxEntries: 20 })

const TIMELINE_REQUEST_TIMEOUT_MS = 180000
const TIMELINE_TRANSCRIPT_RETRY_COUNT = 4
const TIMELINE_TRANSCRIPT_RETRY_DELAY_MS = 1000

const I18N = {
  en: {
    unconfigured: 'Configure API settings first',
    unconfiguredBody: 'Connect your model provider to unlock transcript summarization and chat.',
    openSettings: 'Open settings',
    noVideo: 'Open a supported page',
    noVideoBody: 'Open a YouTube video or a normal webpage to load summary and chat tools in the side panel. If you just reloaded the extension, refresh the current page.',
    pageReconnectTitle: 'Reconnect the current page',
    pageReconnectBody: 'The current page has not reconnected to the extension yet. Click Retry to refresh this page.',
    summarize: 'Summarize',
    subtitles: 'Timeline summary',
    activeVideo: 'Active video',
    languageLabel: 'Language',
    transcriptLabel: 'Transcript',
    tabChatSubtitle: 'Transcript agent',
    tabSummarySubtitle: 'Editorial brief',
    tabTimelineSubtitle: 'Segment map',
    subtitlesLoading: 'Loading timeline content...',
    refreshSubtitles: 'Refresh timeline',
    exportSubtitles: 'Export SRT (.txt)',
    exportSubtitlesLoading: 'Exporting...',
    back: 'Back',
    chat: 'Chat',
    ask: 'Ask',
    restartChat: 'Restart chat',
    chatInputLabel: 'Ask about this video',
    chatPlaceholder: 'Ask about this video...',
    transcriptReady: 'Loaded',
    transcriptStandby: 'Standby',
    workspaceErrorTitle: 'Something interrupted the workspace',
    noSubtitlesAvailable: 'No timeline summary available',
    timelineGenerating: 'Generating timeline summary...',
    loading: 'Generating summary...',
    cancel: 'Cancel',
    copy: 'Copy',
    regenerate: 'Regenerate',
    retry: 'Retry',
    unknownVideo: 'Unknown video',
    extractingVideoInfo: 'Extracting video info...',
    openYoutubeFirst: 'Open a supported page first',
    cannotIdentifyTab: 'Cannot identify the current tab',
    cannotConnectPage: 'Cannot connect to the page. If you just reloaded the extension, refresh the current page and try again',
    noCaptions: 'This video has no captions, so summarization is unavailable',
    manualCaptionsRequired:
      'Turn on YouTube captions manually, confirm they are visible on the video, then try summarizing or exporting again',
    emptyTranscript: 'Caption content is empty',
    fetchFailed: 'Failed to fetch captions. Please try again',
    noVideoId: 'No video detected. Open a supported page first',
    unknownError: 'Unknown error',
    cancelled: '(Cancelled)',
    apiFailed: 'API request failed',
    exportFailed: 'Subtitle export failed',
    summaryRefreshTitle: 'Page updated after this summary',
    summaryRefreshBody: 'This summary and chat may reflect the previous version of the page.',
    summaryRefreshAction: 'Summarize again',
    switchLanguage: 'Switch language',
    openSettingsLabel: 'Open settings',
  },
  zh: {
    unconfigured: '请先配置 API 信息',
    unconfiguredBody: '先连接模型提供方，才能使用字幕总结和对话。',
    openSettings: '前往设置',
    noVideo: '请打开可支持的页面',
    noVideoBody: '打开 YouTube 视频页或普通网页后，这里会加载总结与对话工具。如果你刚刚重载了插件，请刷新当前页面。',
    pageReconnectTitle: '当前页面需要重新连接',
    pageReconnectBody: '当前页面还没有重新连接到插件。请点击重试刷新当前页面。',
    summarize: '生成总结',
    subtitles: '分段总结',
    activeVideo: '当前视频',
    languageLabel: '语言',
    transcriptLabel: '字幕',
    tabChatSubtitle: '字幕智能体',
    tabSummarySubtitle: '总结简报',
    tabTimelineSubtitle: '片段地图',
    subtitlesLoading: '正在加载时间线内容...',
    refreshSubtitles: '刷新分段总结',
    exportSubtitles: '导出字幕（.txt）',
    exportSubtitlesLoading: '导出中...',
    back: '返回',
    chat: '对话',
    ask: '提问',
    restartChat: '重新开始对话',
    chatInputLabel: '针对这条视频提问',
    chatPlaceholder: '针对这条视频提问...',
    transcriptReady: '已载入',
    transcriptStandby: '待命',
    workspaceErrorTitle: '工作区被中断了',
    noSubtitlesAvailable: '暂无分段总结',
    timelineGenerating: '正在生成分段总结...',
    loading: '正在实时生成总结...',
    cancel: '取消',
    copy: '复制',
    regenerate: '重新生成',
    retry: '重试',
    unknownVideo: '未知视频',
    extractingVideoInfo: '正在提取视频信息...',
    openYoutubeFirst: '请先打开可支持的页面',
    cannotIdentifyTab: '无法识别当前标签页',
    cannotConnectPage: '无法连接到页面；如果你刚刚重载了插件，请刷新当前页面后重试',
    noCaptions: '该视频没有字幕，暂不支持总结',
    manualCaptionsRequired: '请先在 YouTube 播放器中手动打开字幕，并确认视频画面已显示字幕，再回来生成总结或导出字幕',
    emptyTranscript: '字幕内容为空',
    fetchFailed: '字幕获取失败，请重试',
    noVideoId: '未检测到可用内容，请先打开可支持的页面',
    unknownError: '未知错误',
    cancelled: '（已取消）',
    apiFailed: 'API 调用失败',
    exportFailed: '字幕导出失败',
    summaryRefreshTitle: '页面已经更新',
    summaryRefreshBody: '当前总结和对话可能还是基于刷新前的页面内容。',
    summaryRefreshAction: '重新总结',
    switchLanguage: '切换语言',
    openSettingsLabel: '打开设置',
  },
}

function t(key) {
  const table = I18N[currentLanguage] || I18N.en
  return table[key] || I18N.en[key] || key
}

function shouldOfferPageReload(errorCode) {
  return errorCode === 'PAGE_CONTEXT_UNAVAILABLE' || errorCode === 'NEED_REFRESH'
}

function updateNoVideoStateCopy() {
  const reconnectNeeded = shouldOfferPageReload(currentPageContext?.error)
  noVideoTextEl.textContent = reconnectNeeded ? t('pageReconnectTitle') : t('noVideo')
  if (noVideoBodyEl) {
    noVideoBodyEl.textContent = reconnectNeeded ? t('pageReconnectBody') : t('noVideoBody')
  }
  if (noVideoRetryBtnEl) {
    noVideoRetryBtnEl.textContent = t('retry')
    noVideoRetryBtnEl.style.display = reconnectNeeded ? 'inline-flex' : 'none'
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en'
  unconfiguredTextEl.textContent = t('unconfigured')
  if (unconfiguredBodyEl) unconfiguredBodyEl.textContent = t('unconfiguredBody')
  openOptionsEl.textContent = t('openSettings')
  updateNoVideoStateCopy()
  summarizeBtnEl.textContent = t('summarize')
  viewSubtitlesBtnEl.textContent = t('subtitles')
  if (workspaceTabSummaryTitleEl) workspaceTabSummaryTitleEl.textContent = t('summarize')
  if (workspaceTabChatTitleEl) workspaceTabChatTitleEl.textContent = t('chat')
  if (workspaceTabTimelineTitleEl) workspaceTabTimelineTitleEl.textContent = t('subtitles')
  exportButtons.forEach((button) => {
    button.textContent = subtitlesExporting ? t('exportSubtitlesLoading') : t('exportSubtitles')
  })
  doneSubtitlesBtnEl.textContent = t('subtitles')
  subtitlesRefreshBtnEl.textContent = t('refreshSubtitles')
  subtitlesBackBtnEl.textContent = t('back')
  loadingLabelEl.textContent = t('loading')
  cancelBtnEl.textContent = t('cancel')
  copyBtnEl.textContent = t('copy')
  if (summaryRefreshTitleEl) summaryRefreshTitleEl.textContent = t('summaryRefreshTitle')
  if (summaryRefreshBodyEl) summaryRefreshBodyEl.textContent = t('summaryRefreshBody')
  if (summaryRefreshBtnEl) summaryRefreshBtnEl.textContent = t('summaryRefreshAction')
  retryBtnEl.textContent = t('regenerate')
  errorRetryBtnEl.textContent = t('retry')
  if (errorTitleEl) errorTitleEl.textContent = t('workspaceErrorTitle')
  if (chatSendBtnEl) chatSendBtnEl.textContent = t('ask')
  if (chatRestartBtnEl) chatRestartBtnEl.textContent = t('restartChat')
  if (chatInputLabelEl) chatInputLabelEl.textContent = t('chatInputLabel')
  if (chatInputEl) chatInputEl.placeholder = t('chatPlaceholder')
  langToggleBtnEl.textContent = getLanguageToggleLabel(currentLanguage)
  langToggleBtnEl.setAttribute('aria-label', t('switchLanguage'))
  openOptionsIconEl.setAttribute('aria-label', t('openSettingsLabel'))
  openOptionsIconEl.setAttribute('title', t('openSettingsLabel'))
  applySourceAwareText()
  refreshWorkspaceMeta()
}

function applyLanguageIfChanged(language) {
  const normalized = normalizeLanguage(language)
  if (normalized === currentLanguage) return
  clearAllWorkspaceSessions()
  currentLanguage = normalized
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: currentVideoInfo?.videoId || '',
    language: currentLanguage,
    forceReset: true,
  })
  pageChatSession = syncPageChatSession(pageChatSession, {
    pageKey: currentPageContext?.pageKey || '',
    language: currentLanguage,
    forceReset: true,
  })
  applyStaticTranslations()
  updateVideoTitles(currentPageContext?.title || currentVideoInfo?.title)
  if (states.subtitles.style.display === 'flex') {
    openSubtitlesView(true).catch(() => {})
  }
  renderChatMessages()
  notifyEmbedResize()
}

async function switchLanguage() {
  const next = nextLanguage(currentLanguage)
  clearAllWorkspaceSessions()
  currentLanguage = next
  pageChatSession = syncPageChatSession(pageChatSession, {
    pageKey: currentPageContext?.pageKey || '',
    language: currentLanguage,
    forceReset: true,
  })
  applyStaticTranslations()
  updateVideoTitles(currentPageContext?.title || currentVideoInfo?.title)
  if (states.subtitles.style.display === 'flex') {
    openSubtitlesView(true).catch(() => {})
  }
  notifyEmbedResize()

  try {
    const config = await loadConfig()
    await saveConfig({ ...config, language: next })
  } catch {
    // ignore persist failures and keep in-memory language
  }
}

const searchParams = new URLSearchParams(window.location.search)
if (searchParams.get('embed') === '1') {
  document.body.classList.add('inpage-embed')
}

function getCurrentSourceType() {
  return resolveWorkspaceSourceType(currentPageContext)
}

function isWebpageMode() {
  return currentPageContext?.sourceType === 'webpage'
}

function getActiveChatSession() {
  return isWebpageMode() ? pageChatSession : videoChatSession
}

function cloneWorkspaceData(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

function getWorkspaceSessionSourceKey(context = currentPageContext, videoInfo = currentVideoInfo) {
  if (context?.sourceType === 'webpage') {
    const pageKey = String(context?.pageKey || '').trim()
    return pageKey ? `webpage:${pageKey}` : ''
  }

  if (context?.sourceType === 'youtube') {
    const videoId = String(context?.videoId || videoInfo?.videoId || '').trim()
    return videoId ? `youtube:${videoId}` : ''
  }

  return ''
}

function getVisibleWorkspaceState() {
  const names = ['done', 'subtitles', 'loading', 'ready', 'error']
  return names.find((name) => states[name]?.style?.display === 'flex') || 'ready'
}

function setWorkspaceSnapshotStale(stale) {
  workspaceSnapshotStale = Boolean(stale)
  if (summaryRefreshNoticeEl) {
    summaryRefreshNoticeEl.style.display = workspaceSnapshotStale ? 'flex' : 'none'
  }
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''))
    return true
  } catch {
    return false
  }
}

async function reloadCurrentTab() {
  const tab = await getActiveTab()
  if (!tab?.id) return false

  try {
    chrome.tabs.reload(tab.id)
    return true
  } catch {
    return false
  }
}

function captureWorkspaceSessionSnapshot() {
  const sourceKey = getWorkspaceSessionSourceKey()
  if (!currentTabId || !sourceKey) return null

  const visibleState = getVisibleWorkspaceState()
  const workspaceState = visibleState === 'done' || visibleState === 'subtitles'
    ? visibleState
    : String(summaryResultEl?.innerText || summaryOutputEl?.textContent || '').trim()
      ? 'done'
      : 'ready'

  return {
    workspaceState,
    currentWorkspaceTab,
    previousStateBeforeSubtitles,
    sourceSignature: workspaceContentBasisSignature,
    currentVideoInfo: cloneWorkspaceData(currentVideoInfo),
    currentPageContext: cloneWorkspaceData(currentPageContext),
    videoChatSession: cloneWorkspaceData(videoChatSession),
    pageChatSession: cloneWorkspaceData(pageChatSession),
    subtitleCache: cloneWorkspaceData(subtitleCache),
    summaryText: String(summaryOutputEl?.textContent || ''),
    summaryHtml: String(summaryResultEl?.innerHTML || ''),
  }
}

async function persistCurrentWorkspaceSession() {
  const snapshot = captureWorkspaceSessionSnapshot()
  if (!snapshot) return false

  workspaceSessionCache.set({
    tabId: currentTabId,
    sourceKey: getWorkspaceSessionSourceKey(),
    snapshot,
  })
  return saveWorkspaceSessionSnapshot({
    tabId: currentTabId,
    sourceKey: getWorkspaceSessionSourceKey(),
    snapshot,
    maxEntries: 20,
  })
}

function schedulePersistCurrentWorkspaceSession(delay = 0) {
  if (persistSnapshotTimer) {
    clearTimeout(persistSnapshotTimer)
  }
  persistSnapshotTimer = setTimeout(() => {
    persistSnapshotTimer = null
    persistCurrentWorkspaceSession().catch(() => {})
  }, Math.max(0, Number(delay) || 0))
}

async function restoreWorkspaceSessionForTab(tabId, context, videoInfo = null) {
  const sourceKey = getWorkspaceSessionSourceKey(context, videoInfo)
  if (!tabId || !sourceKey) return false

  let snapshot = workspaceSessionCache.get({ tabId, sourceKey })
  if (!snapshot) {
    snapshot = await loadWorkspaceSessionSnapshot({ tabId, sourceKey })
    if (snapshot) {
      workspaceSessionCache.set({ tabId, sourceKey, snapshot })
    }
  }
  if (!snapshot) return false

  currentVideoInfo = cloneWorkspaceData(snapshot.currentVideoInfo) || null
  currentPageContext = cloneWorkspaceData(snapshot.currentPageContext) || {
    sourceType: 'unsupported',
    error: 'UNSUPPORTED_PAGE',
    title: '',
    url: '',
  }
  videoChatSession = cloneWorkspaceData(snapshot.videoChatSession) || createVideoChatSession({ videoId: '', language: currentLanguage })
  pageChatSession = cloneWorkspaceData(snapshot.pageChatSession) || createPageChatSession({ pageKey: '', language: currentLanguage })
  subtitleCache = cloneWorkspaceData(snapshot.subtitleCache) || buildSubtitleCache('', [])
  currentWorkspaceTab = ['summary', 'chat', 'timeline'].includes(snapshot.currentWorkspaceTab)
    ? snapshot.currentWorkspaceTab
    : 'summary'
  previousStateBeforeSubtitles = snapshot.previousStateBeforeSubtitles === 'done' ? 'done' : 'ready'
  workspaceContentBasisSignature = String(snapshot.sourceSignature || '')
  setWorkspaceSnapshotStale(
    isWorkspaceSnapshotStale({
      snapshotSignature: workspaceContentBasisSignature,
      context,
      videoInfo,
    })
  )

  summaryOutputEl.textContent = String(snapshot.summaryText || '')
  summaryResultEl.innerHTML = String(snapshot.summaryHtml || '')
  errorMsgEl.textContent = ''
  setLoadingVisual(false)
  updateVideoTitles(currentPageContext?.title || currentVideoInfo?.title)
  refreshWorkspaceMeta()
  renderChatMessages()
  showState(snapshot.workspaceState === 'subtitles' ? 'subtitles' : snapshot.workspaceState === 'done' ? 'done' : 'ready')
  return true
}

async function clearWorkspaceSessionsForTab(tabId) {
  workspaceSessionCache.clearTab(tabId)
  await clearWorkspaceSessionTab({ tabId })
  if (currentTabId === Number(tabId)) {
    currentTabId = 0
  }
}

function clearAllWorkspaceSessions() {
  workspaceSessionCache.clear()
  clearWorkspaceSessionStore().catch(() => {})
}

function applyWorkspaceCapabilities() {
  const capabilities = getWorkspaceCapabilities(getCurrentSourceType())
  if (workspaceTabTimelineEl) workspaceTabTimelineEl.style.display = capabilities.canViewTimeline ? 'inline-flex' : 'none'
  if (viewSubtitlesBtnEl) viewSubtitlesBtnEl.style.display = capabilities.canViewTimeline ? '' : 'none'
  if (doneSubtitlesBtnEl) doneSubtitlesBtnEl.style.display = capabilities.canViewTimeline ? '' : 'none'
  exportButtons.forEach((button) => {
    button.style.display = capabilities.canExportSubtitles ? '' : 'none'
  })
  if (!capabilities.canViewTimeline && currentWorkspaceTab === 'timeline') {
    currentWorkspaceTab = 'summary'
  }
}

function getFocusLabel() {
  if (getCurrentSourceType() === 'unsupported') {
    return currentLanguage === 'zh' ? '未就绪' : 'Not ready'
  }
  if (!isWebpageMode()) return String(currentLanguage || 'en').toUpperCase()
  if (currentPageContext?.focusType === 'selection') {
    return currentLanguage === 'zh' ? '选中' : 'Selection'
  }
  return currentLanguage === 'zh' ? '整页' : 'Page'
}

function getContextReadinessLabel() {
  if (getCurrentSourceType() === 'unsupported') {
    return currentLanguage === 'zh' ? '等待页面' : 'Waiting for page'
  }

  if (!isWebpageMode()) {
    const hasTranscript = Boolean(String(subtitleCache?.transcriptText || '').trim())
    return hasTranscript ? t('transcriptReady') : t('transcriptStandby')
  }

  if (!String(currentPageContext?.contentText || '').trim()) {
    return currentLanguage === 'zh' ? '待命' : 'Standby'
  }

  return currentPageContext?.focusType === 'selection'
    ? (currentLanguage === 'zh' ? '选中内容已就绪' : 'Selection ready')
    : (currentLanguage === 'zh' ? '页面内容已就绪' : 'Page ready')
}

function applySourceAwareText() {
  const sourceType = getCurrentSourceType()
  const labels = getSourceLabels(sourceType, currentLanguage)
  if (workspaceVideoEyebrowEl) workspaceVideoEyebrowEl.textContent = labels.eyebrow
  if (workspaceLanguageLabelEl) workspaceLanguageLabelEl.textContent = labels.metaLabel
  if (workspaceTranscriptLabelEl) workspaceTranscriptLabelEl.textContent = labels.readinessLabel

  if (workspaceTabChatSubtitleEl) {
    workspaceTabChatSubtitleEl.textContent = getCurrentSourceType() === 'unsupported'
      ? (currentLanguage === 'zh' ? '等待页面内容' : 'Waiting for page content')
      : isWebpageMode()
      ? (currentLanguage === 'zh' ? '网页智能体' : 'Page agent')
      : t('tabChatSubtitle')
  }
  if (workspaceTabSummarySubtitleEl) {
    workspaceTabSummarySubtitleEl.textContent = getCurrentSourceType() === 'unsupported'
      ? (currentLanguage === 'zh' ? '等待页面内容' : 'Waiting for page content')
      : isWebpageMode()
      ? (currentLanguage === 'zh' ? '网页简报' : 'Page brief')
      : t('tabSummarySubtitle')
  }
  if (workspaceTabTimelineSubtitleEl) {
    workspaceTabTimelineSubtitleEl.textContent = t('tabTimelineSubtitle')
  }
  if (chatInputLabelEl) {
    chatInputLabelEl.textContent = getCurrentSourceType() === 'unsupported'
      ? (currentLanguage === 'zh' ? '等待可用页面' : 'Waiting for a supported page')
      : isWebpageMode()
      ? (currentLanguage === 'zh' ? '针对当前网页提问' : 'Ask about this page')
      : t('chatInputLabel')
  }
  if (chatInputEl) {
    chatInputEl.placeholder = getCurrentSourceType() === 'unsupported'
      ? (currentLanguage === 'zh' ? '页面准备好后可在这里提问...' : 'Ask here once the page is ready...')
      : isWebpageMode()
      ? (currentLanguage === 'zh' ? '针对当前网页提问...' : 'Ask about this page...')
      : t('chatPlaceholder')
  }

  applyWorkspaceCapabilities()
}

function notifyEmbedResize() {
  if (!document.body.classList.contains('inpage-embed')) return
  if (resizeScheduled) return
  resizeScheduled = true

  requestAnimationFrame(() => {
    resizeScheduled = false

    const container = document.querySelector('.container')
    const measured = measureEmbedHeight({
      containerHeight: container?.scrollHeight || 0,
      bodyHeight: document.body.scrollHeight || 0,
      documentHeight: document.documentElement.scrollHeight || 0,
      padding: 8,
      min: 150,
      max: 760,
    })

    window.parent?.postMessage(
      {
        source: IFRAME_BRIDGE_SOURCE,
        type: 'RESIZE',
        height: measured,
      },
      '*'
    )
  })
}

function showState(name) {
  const inWorkspace = ['ready', 'loading', 'done', 'subtitles'].includes(name)
  Object.entries(states).forEach(([key, el]) => {
    if (!el) return
    if (key === 'workspace') {
      el.style.display = inWorkspace ? 'flex' : 'none'
      return
    }

    if (inWorkspace && ['ready', 'loading', 'done', 'subtitles'].includes(key)) {
      el.style.display = key === name ? 'flex' : 'none'
      return
    }

    el.style.display = key === name ? 'flex' : 'none'
  })

  if (inWorkspace) {
    switchWorkspaceTab(name === 'subtitles' ? 'timeline' : currentWorkspaceTab || 'summary')
  }
  notifyEmbedResize()
  renderChatMessages()
}

function updateVideoTitles(title) {
  const safeTitle = String(title || '').trim() || t('unknownVideo')
  ;[videoTitleEl, videoTitleLoadingEl, videoTitleDoneEl, videoTitleSubtitlesEl].forEach((el) => {
    if (el) el.textContent = safeTitle
  })
  refreshWorkspaceMeta()
}

function refreshWorkspaceMeta() {
  updateNoVideoStateCopy()
  if (workspaceLanguagePillEl) {
    workspaceLanguagePillEl.textContent = getFocusLabel()
  }

  if (workspaceTranscriptPillEl) {
    const isReady = isWebpageMode()
      ? Boolean(String(currentPageContext?.contentText || '').trim())
      : Boolean(String(subtitleCache?.transcriptText || '').trim())
    workspaceTranscriptPillEl.textContent = getContextReadinessLabel()
    workspaceTranscriptPillEl.classList.toggle('is-muted', !isReady)
  }

  applySourceAwareText()
}

function switchWorkspaceTab(tabName = 'summary') {
  currentWorkspaceTab = tabName

  const tabs = {
    summary: workspaceTabSummaryEl,
    chat: workspaceTabChatEl,
    timeline: workspaceTabTimelineEl,
  }
  const panels = {
    summary: workspacePanelSummaryEl,
    chat: workspacePanelChatEl,
    timeline: workspacePanelTimelineEl,
  }

  Object.entries(tabs).forEach(([key, el]) => {
    if (!el) return
    el.classList.toggle('is-active', key === tabName)
  })
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return
    el.classList.toggle('is-active', key === tabName)
    el.style.display = key === tabName ? 'flex' : 'none'
  })

  notifyEmbedResize()
  schedulePersistCurrentWorkspaceSession(40)
}

function renderChatMessages() {
  if (!chatMessagesEl) return
  chatMessagesEl.innerHTML = ''

   const activeSession = getActiveChatSession()

  if (!Array.isArray(activeSession?.turns) || activeSession.turns.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'chat-empty'
    empty.textContent = isWebpageMode()
      ? (currentLanguage === 'zh'
          ? '你可以直接问当前网页的内容，例如：这篇文章的核心观点是什么？'
          : 'Ask directly about this page, for example: what is the main argument on this page?')
      : (currentLanguage === 'zh'
          ? '你可以直接问这条视频里的内容，例如：这段视频的核心观点是什么？'
          : 'Ask directly about this video, for example: what is the main argument in this video?')
    chatMessagesEl.appendChild(empty)
    notifyEmbedResize()
    return
  }

  const fragment = document.createDocumentFragment()
  for (const turn of activeSession.turns) {
    const item = document.createElement('div')
    item.className = `chat-message ${turn.role}`

    const head = document.createElement('div')
    head.className = 'chat-message-head'

    const role = document.createElement('div')
    role.className = 'chat-message-role'
    role.textContent = getChatRoleLabel(turn.role, currentLanguage)

    const copyBtn = document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'chat-copy-btn'
    copyBtn.textContent = getChatCopyLabel(currentLanguage)
    copyBtn.addEventListener('click', () => {
      copyTextToClipboard(turn.content)
    })

    head.appendChild(role)
    head.appendChild(copyBtn)

    const content = document.createElement('div')
    content.className = 'chat-message-content'
    if (turn.role === 'assistant') {
      content.innerHTML = renderChatContent(turn.role, turn.content)
    } else {
      content.innerHTML = renderChatContent(turn.role, turn.content)
    }

    item.appendChild(head)
    item.appendChild(content)

    if (turn.role === 'assistant' && Array.isArray(turn.citations) && turn.citations.length > 0) {
      const citationsEl = document.createElement('div')
      citationsEl.className = 'chat-citations'

      for (const citation of turn.citations) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'chat-citation secondary'
        button.textContent = citation.label
        if (Number.isFinite(Number(citation.startSec))) {
          button.dataset.startSec = String(citation.startSec)
        }
        citationsEl.appendChild(button)
      }

      item.appendChild(citationsEl)
    }

    fragment.appendChild(item)
  }

  chatMessagesEl.appendChild(fragment)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  notifyEmbedResize()
}

async function ensureChatSession(forceTranscriptRefresh = false) {
  if (isWebpageMode()) {
    if (!currentPageContext?.pageKey || !String(currentPageContext?.contentText || '').trim()) {
      await syncVideoInfo()
    }

    if (!currentPageContext?.pageKey || !String(currentPageContext?.contentText || '').trim()) {
      return { success: false, error: currentPageContext?.error || 'EMPTY_CONTENT' }
    }

    if (pageChatSession.pageKey !== currentPageContext.pageKey || pageChatSession.language !== currentLanguage) {
      pageChatSession = syncPageChatSession(pageChatSession, {
        pageKey: currentPageContext.pageKey,
        language: currentLanguage,
      })
    }

    const needsPageSnapshot = forceTranscriptRefresh || workspaceSnapshotStale || !String(pageChatSession.contentText || '').trim()
    if (needsPageSnapshot) {
      appendPageSnapshot(pageChatSession, {
        contentText: currentPageContext.contentText,
        focusText: currentPageContext.focusText,
        pageChunks: chunkPageText(currentPageContext.contentText, { maxChars: 900 }),
        summaryDigest: String(summaryResultEl?.innerText || '').trim() || pageChatSession.summaryDigest || '',
      })
    }

    return { success: true }
  }

  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: currentVideoInfo?.videoId || '',
    language: currentLanguage,
  })

  if (!currentVideoInfo?.videoId) {
    await syncVideoInfo()
    videoChatSession = syncVideoChatSession(videoChatSession, {
      videoId: currentVideoInfo?.videoId || '',
      language: currentLanguage,
    })
  }

  if (!currentVideoInfo?.videoId) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  let transcriptResult = {
    success: true,
    text: subtitleCache.transcriptText,
    mergedSegments: subtitleCache.mergedSegments,
    segments: subtitleCache.segments,
  }

  const needsTranscript = forceTranscriptRefresh || !String(videoChatSession.transcriptText || '').trim()
  if (needsTranscript) {
    transcriptResult = await getTranscriptForCurrentVideo(forceTranscriptRefresh)
    if (!transcriptResult?.success) {
      return transcriptResult
    }
  }

  const transcriptChunks = chunkTranscriptSegments(
    transcriptResult.mergedSegments || subtitleCache.mergedSegments || [],
    { maxChars: 900 }
  )

  appendTranscriptSnapshot(videoChatSession, {
    transcriptText: transcriptResult.text || subtitleCache.transcriptText || '',
    transcriptChunks,
    summaryDigest: String(summaryResultEl?.innerText || '').trim() || videoChatSession.summaryDigest || '',
  })

  return { success: true }
}

function resetSummaryContent() {
  summaryOutputEl.textContent = ''
  summaryResultEl.textContent = ''
  errorMsgEl.textContent = ''
  workspaceContentBasisSignature = ''
  setWorkspaceSnapshotStale(false)
  if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'none'
  if (loadingSkeletonEl) loadingSkeletonEl.style.display = 'none'
  notifyEmbedResize()
}

function setLoadingVisual(active, hasContent = false) {
  if (!loadingIndicatorEl || !loadingSkeletonEl) return

  if (!active) {
    loadingIndicatorEl.style.display = 'none'
    loadingSkeletonEl.style.display = 'none'
    return
  }

  loadingIndicatorEl.style.display = hasContent ? 'none' : 'inline-flex'
  loadingSkeletonEl.style.display = hasContent ? 'none' : 'grid'
}

function formatSubtitleTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`
  }

  return `${mm}:${ss}`
}

function renderSubtitles(segments = []) {
  if (!subtitlesListEl) return

  subtitlesListEl.innerHTML = ''
  if (!Array.isArray(segments) || segments.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'subtitles-empty'
    empty.textContent = t('noSubtitlesAvailable')
    subtitlesListEl.appendChild(empty)
    notifyEmbedResize()
    return
  }

  const fragment = document.createDocumentFragment()
  for (const segment of segments) {
    const row = document.createElement('div')
    row.className = 'subtitle-row'

    const timeBtn = document.createElement('button')
    timeBtn.className = 'subtitle-time'
    timeBtn.type = 'button'
    const startSec = Number(segment?.startSec)
    if (Number.isFinite(startSec) && startSec >= 0) {
      timeBtn.dataset.startSec = String(startSec)
    }
    timeBtn.textContent = formatSubtitleTimestamp(startSec)

    const textEl = document.createElement('div')
    textEl.className = 'subtitle-text'
    textEl.textContent = String(segment?.text || '').trim()

    row.appendChild(timeBtn)
    row.appendChild(textEl)
    fragment.appendChild(row)
  }

  subtitlesListEl.appendChild(fragment)
  notifyEmbedResize()
}

function renderSubtitlesLoading(labelText = t('subtitlesLoading')) {
  if (!subtitlesListEl) return

  subtitlesListEl.innerHTML = ''
  const wrapper = document.createElement('div')
  wrapper.className = 'subtitles-loading'

  const label = document.createElement('p')
  label.className = 'subtitles-loading-label'
  label.textContent = labelText
  wrapper.appendChild(label)

  for (let i = 0; i < 4; i += 1) {
    const row = document.createElement('div')
    row.className = 'subtitle-skeleton-row'
    row.innerHTML = '<span></span><span></span>'
    wrapper.appendChild(row)
  }

  subtitlesListEl.appendChild(wrapper)
  notifyEmbedResize()
}

function setSubtitlesLoading(active) {
  subtitlesLoading = Boolean(active)
  if (subtitlesRefreshBtnEl) subtitlesRefreshBtnEl.disabled = subtitlesLoading
  if (viewSubtitlesBtnEl) viewSubtitlesBtnEl.disabled = subtitlesLoading
  if (doneSubtitlesBtnEl) doneSubtitlesBtnEl.disabled = subtitlesLoading
  exportButtons.forEach((button) => {
    button.disabled = subtitlesLoading || subtitlesExporting
  })
}

function setSubtitlesExporting(active) {
  subtitlesExporting = Boolean(active)
  exportButtons.forEach((button) => {
    button.disabled = subtitlesLoading || subtitlesExporting
    button.textContent = subtitlesExporting ? t('exportSubtitlesLoading') : t('exportSubtitles')
  })
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSubtitleExportFilename(title) {
  const safeTitle = sanitizeFilenamePart(title) || 'subtitles'
  return `${safeTitle}.srt.txt`
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function consumePendingLaunchAction(tabId) {
  try {
    const result = await chrome.storage.local.get(['pendingPanelLaunch'])
    const pending = result?.pendingPanelLaunch
    if (!pending || pending.tabId !== tabId) return null
    await chrome.storage.local.remove(['pendingPanelLaunch'])
    return pending
  } catch {
    return null
  }
}

async function maybeApplyPendingLaunchAction() {
  const tab = await getActiveTab()
  if (!tab?.id) return
  const pending = await consumePendingLaunchAction(tab.id)
  if (!pending) return

  if (pending.mode === 'chat') {
    await openChatWorkspace()
    return
  }

  await startSummarize()
}

async function applyLaunchAction(action) {
  if (!action || typeof action !== 'object') return

  if (action.mode === 'chat') {
    await openChatWorkspace()
    return
  }

  await startSummarize()
}

async function seekVideoTo(seconds) {
  const tab = await getActiveTab()
  if (!tab?.id) return false

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'SEEK_TO',
      seconds,
    })
    return Boolean(response?.success)
  } catch {
    return false
  }
}

async function openChatWorkspace() {
  if (isWebpageMode()) {
    showState('ready')
    switchWorkspaceTab('chat')
    renderChatMessages()
    schedulePersistCurrentWorkspaceSession(40)
    return
  }

  if (!currentVideoInfo?.videoId) {
    await syncVideoInfo()
  }
  if (!currentVideoInfo?.videoId) {
    showError(t('openYoutubeFirst'))
    return
  }

  showState('ready')
  switchWorkspaceTab('chat')
  renderChatMessages()
  schedulePersistCurrentWorkspaceSession(40)
}

function restartChatSession() {
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }

  if (isWebpageMode()) {
    pageChatSession = syncPageChatSession(pageChatSession, {
      pageKey: currentPageContext?.pageKey || '',
      language: currentLanguage,
      forceReset: true,
    })
    renderChatMessages()
    schedulePersistCurrentWorkspaceSession(40)
    return
  }

  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: currentVideoInfo?.videoId || '',
    language: currentLanguage,
    forceReset: true,
  })
  renderChatMessages()
  schedulePersistCurrentWorkspaceSession(40)
}

async function submitChatQuestion(event) {
  event?.preventDefault?.()

  const question = String(chatInputEl?.value || '').trim()
  if (!question) return

  const sessionReady = await ensureChatSession(false)
  if (!sessionReady?.success) {
    showError(mapTranscriptError(sessionReady?.error), { errorCode: sessionReady?.error })
    return
  }

  switchWorkspaceTab('chat')
  const activeSession = getActiveChatSession()
  addChatTurn(activeSession, { role: 'user', content: question })
  renderChatMessages()
  schedulePersistCurrentWorkspaceSession(80)
  chatInputEl.value = ''
  if (chatSendBtnEl) chatSendBtnEl.disabled = true
  if (chatRestartBtnEl) chatRestartBtnEl.disabled = true

  const assistantTurn = { role: 'assistant', content: '', citations: [] }
  activeSession.turns.push(assistantTurn)
  renderChatMessages()
  let streamingAssistantContentEl = chatMessagesEl?.querySelector('.chat-message.assistant:last-child .chat-message-content') || null

  compactSessionTurns(activeSession, { keepLastTurns: 6 })

  chatAbortController = new AbortController()

  try {
    const agentResult = isWebpageMode()
      ? await runPageChatAgentTurn({
          config: await loadConfig(),
          session: activeSession,
          question,
          signal: chatAbortController.signal,
          onChunk: (chunk) => {
            assistantTurn.content += String(chunk || '')
            if (streamingAssistantContentEl) {
              streamingAssistantContentEl.innerHTML = renderChatContent('assistant', assistantTurn.content)
              chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
              notifyEmbedResize()
              return
            }

            renderChatMessages()
            streamingAssistantContentEl = chatMessagesEl?.querySelector('.chat-message.assistant:last-child .chat-message-content') || null
          },
        })
      : await runVideoChatAgentTurn({
          config: await loadConfig(),
          session: activeSession,
          question,
          signal: chatAbortController.signal,
          onChunk: (chunk) => {
            assistantTurn.content += String(chunk || '')
            if (streamingAssistantContentEl) {
              streamingAssistantContentEl.innerHTML = renderChatContent('assistant', assistantTurn.content)
              chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
              notifyEmbedResize()
              return
            }

            renderChatMessages()
            streamingAssistantContentEl = chatMessagesEl?.querySelector('.chat-message.assistant:last-child .chat-message-content') || null
          },
        })

    assistantTurn.content = agentResult.answer
    assistantTurn.citations = agentResult.citations
    addChatTurn(activeSession, {
      role: 'assistant',
      content: assistantTurn.content,
      citations: assistantTurn.citations,
    })
    activeSession.turns = activeSession.turns.filter((turn) => turn !== assistantTurn)
    compactSessionTurns(activeSession, { keepLastTurns: 6 })
    renderChatMessages()
    schedulePersistCurrentWorkspaceSession(80)
  } catch (error) {
    activeSession.turns = activeSession.turns.filter((turn) => turn !== assistantTurn)
    showError(`${t('apiFailed')}: ${error?.message || t('unknownError')}`)
    schedulePersistCurrentWorkspaceSession(80)
  } finally {
    chatAbortController = null
    if (chatSendBtnEl) chatSendBtnEl.disabled = false
    if (chatRestartBtnEl) chatRestartBtnEl.disabled = false
  }
}

function mapTranscriptError(errorCode) {
  const errorMap = {
    NO_CAPTIONS: t('noCaptions'),
    MANUAL_CAPTIONS_REQUIRED: t('manualCaptionsRequired'),
    EMPTY_TRANSCRIPT: t('emptyTranscript'),
    EMPTY_CONTENT: currentLanguage === 'zh' ? '当前网页没有可总结的正文内容' : 'The current page does not contain enough readable text',
    PAGE_CONTEXT_UNAVAILABLE: currentLanguage === 'zh' ? '当前页面还没有重新连接到插件，请点击重试刷新当前页面' : 'The current page has not reconnected to the extension yet. Click Retry to refresh this page',
    UNSUPPORTED_PAGE: currentLanguage === 'zh' ? '当前页面不支持读取，请换一个普通网页试试' : 'This page is not supported. Try a normal webpage instead',
    FETCH_FAILED: t('fetchFailed'),
    NO_VIDEO_ID: t('noVideoId'),
    NEED_REFRESH: t('cannotConnectPage'),
  }
  return errorMap[errorCode] || t('unknownError')
}

async function requestTranscriptFromTab(tabId, language) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'REQUEST_TRANSCRIPT_V2',
      language,
    })

    if (!response) {
      return { success: false, error: 'NEED_REFRESH' }
    }

    return response
  } catch {
    return { success: false, error: 'NEED_REFRESH' }
  }
}

async function requestOriginalTranscriptFromTab(tabId, language) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'REQUEST_TRANSCRIPT_V2',
      language,
      preferOriginal: true,
    })

    if (!response) {
      return { success: false, error: 'NEED_REFRESH' }
    }

    return response
  } catch {
    return { success: false, error: 'NEED_REFRESH' }
  }
}

function buildSubtitleCache(videoId, segments = [], transcriptText = '') {
  const safeSegments = Array.isArray(segments) ? segments : []
  return {
    videoId,
    language: currentLanguage,
    transcriptText: String(transcriptText || ''),
    segments: safeSegments,
    mergedSegments: mergeSubtitleSegments(safeSegments, 10),
    timelineByLanguage: {},
    timelinePendingByLanguage: {},
  }
}

function abortTimelineRequests() {
  const pendingMap = subtitleCache.timelinePendingByLanguage || {}
  Object.values(pendingMap).forEach((pending) => {
    pending?.controller?.abort?.()
  })
  subtitleCache.timelinePendingByLanguage = {}
}

async function getTimelineSummaryForLanguage(config, transcriptResult, forceRefresh = false, onProgress) {
  const language = currentLanguage
  const cachedTimeline = subtitleCache.timelineByLanguage?.[language]
  if (!forceRefresh && Array.isArray(cachedTimeline) && cachedTimeline.length > 0) {
    return cachedTimeline
  }

  const pendingMap = subtitleCache.timelinePendingByLanguage || {}
  const existingPending = pendingMap[language]
  const pendingAge = Date.now() - Number(existingPending?.startedAt || 0)
  const hasStalePending = existingPending?.promise && pendingAge > TIMELINE_REQUEST_TIMEOUT_MS + 5000

  if (hasStalePending && existingPending?.controller) {
    existingPending.controller.abort()
    delete pendingMap[language]
  }

  if (!forceRefresh && existingPending?.promise && !hasStalePending) {
    return existingPending.promise
  }

  if (forceRefresh && existingPending?.controller) {
    existingPending.controller.abort()
  }

  renderSubtitlesLoading(t('timelineGenerating'))
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, TIMELINE_REQUEST_TIMEOUT_MS)

  const promise = summarizeTimelineChunks(
      config,
      transcriptResult.mergedSegments || [],
      language,
      undefined,
      controller.signal,
      transcriptResult.text || subtitleCache.transcriptText || '',
      onProgress
    )
    .then((timeline) => {
      subtitleCache.timelineByLanguage[language] = timeline
      return timeline
    })
    .catch((error) => {
      if (error?.name === 'AbortError') {
        throw new Error('Timeline request timed out')
      }
      throw error
    })
    .finally(() => {
      clearTimeout(timeoutId)
      const currentPending = subtitleCache.timelinePendingByLanguage?.[language]
      if (currentPending?.controller === controller) {
        delete subtitleCache.timelinePendingByLanguage[language]
      }
    })

  subtitleCache.timelinePendingByLanguage[language] = {
    promise,
    controller,
    startedAt: Date.now(),
  }
  return promise
}

async function getTranscriptForCurrentVideo(forceRefresh = false) {
  if (!currentVideoInfo?.videoId) {
    await syncVideoInfo()
  }

  if (!currentVideoInfo?.videoId) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  if (
    !forceRefresh &&
    subtitleCache.videoId === currentVideoInfo.videoId &&
    subtitleCache.language === currentLanguage &&
    (subtitleCache.segments.length > 0 || String(subtitleCache.transcriptText || '').trim())
  ) {
    return {
      success: true,
      text: subtitleCache.transcriptText,
      segments: subtitleCache.segments,
      mergedSegments: subtitleCache.mergedSegments,
    }
  }

  const tab = await getActiveTab()
  if (!tab?.id) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  let transcriptResult
  transcriptResult = await requestTranscriptFromTab(tab.id, currentLanguage)

  if (!transcriptResult?.success) {
    return { success: false, error: transcriptResult?.error || 'UNKNOWN' }
  }

  subtitleCache = {
    ...buildSubtitleCache(
      currentVideoInfo.videoId,
      Array.isArray(transcriptResult.segments) ? transcriptResult.segments : [],
      transcriptResult.text || ''
    ),
  }
  refreshWorkspaceMeta()
  appendTranscriptSnapshot(videoChatSession, {
    transcriptText: transcriptResult.text || '',
    transcriptChunks: chunkTranscriptSegments(subtitleCache.mergedSegments || [], { maxChars: 900 }),
  })

  return {
    success: true,
    text: subtitleCache.transcriptText,
    segments: subtitleCache.segments,
    mergedSegments: subtitleCache.mergedSegments,
  }
}

async function openSubtitlesView(forceRefresh = false) {
  if (isWebpageMode()) {
    showError(currentLanguage === 'zh' ? '网页模式暂不提供时间线视图' : 'Timeline view is only available for YouTube mode')
    return
  }

  lastRequestedMode = 'timeline'
  previousStateBeforeSubtitles = states.done.style.display === 'flex' ? 'done' : 'ready'
  const requestToken = ++subtitlesRequestToken
  updateVideoTitles(currentVideoInfo?.title)
  showState('subtitles')
  setSubtitlesLoading(true)
  renderSubtitlesLoading()
  schedulePersistCurrentWorkspaceSession(40)

  let transcriptResult = null
  for (let attempt = 0; attempt < TIMELINE_TRANSCRIPT_RETRY_COUNT; attempt += 1) {
    const shouldRefresh = forceRefresh || attempt > 0
    transcriptResult = await getTranscriptForCurrentVideo(shouldRefresh)

    if (requestToken !== subtitlesRequestToken) {
      return
    }

    if (transcriptResult?.success) {
      break
    }

    if (transcriptResult?.error !== 'NO_CAPTIONS') {
      break
    }

    if (attempt < TIMELINE_TRANSCRIPT_RETRY_COUNT - 1) {
      renderSubtitlesLoading(`${t('timelineGenerating')} (${attempt + 1}/${TIMELINE_TRANSCRIPT_RETRY_COUNT})`)
      await delay(TIMELINE_TRANSCRIPT_RETRY_DELAY_MS)
    }
  }

  if (requestToken !== subtitlesRequestToken) {
    return
  }

  if (!transcriptResult?.success) {
    setSubtitlesLoading(false)
    lastFailedMode = 'timeline'
    showError(mapTranscriptError(transcriptResult?.error), { errorCode: transcriptResult?.error })
    return
  }

  try {
    const config = await loadConfig()
    const timeline = await getTimelineSummaryForLanguage(
      config,
      transcriptResult,
      forceRefresh,
      (progress) => {
        if (requestToken !== subtitlesRequestToken) return
        const completed = Number(progress?.completedBatches || 0)
        const total = Number(progress?.totalBatches || 0)
        if (completed > 0 && total > 0 && (!Array.isArray(progress?.items) || progress.items.length === 0)) {
          renderSubtitlesLoading(`${t('timelineGenerating')} (${completed}/${total})`)
        }

        if (Array.isArray(progress?.items) && progress.items.length > 0) {
          renderSubtitles(progress.items)
        }
      }
    )
    if (requestToken !== subtitlesRequestToken) return
    setSubtitlesLoading(false)
    renderSubtitles(timeline)
    schedulePersistCurrentWorkspaceSession(80)
  } catch (error) {
    if (requestToken !== subtitlesRequestToken) return
    setSubtitlesLoading(false)
    lastFailedMode = 'timeline'
    showError(`${t('apiFailed')}: ${error?.message || 'unknown'}`)
    schedulePersistCurrentWorkspaceSession(80)
  }
}

function abortCurrentSummary(reason = 'manual') {
  if (!abortController) return
  abortReason = reason
  abortController.abort()
}

async function applyVideoInfo(rawData, options = {}) {
  const { forceReset = false, tabId = 0 } = options
  const next = normalizeVideoInfo(rawData)
  if (!next.videoId) return false

  const previousSourceKey = getWorkspaceSessionSourceKey()
  const nextContext = {
    sourceType: 'youtube',
    pageKey: `youtube:${next.videoId}`,
    videoId: next.videoId,
    title: next.title,
    url: String(rawData?.url || ''),
    focusType: 'transcript',
    contentText: '',
    focusText: '',
    extractState: 'ready',
  }
  const nextSignature = buildWorkspaceSourceSignature(nextContext, next)
  const nextSourceKey = getWorkspaceSessionSourceKey(nextContext, next)
  if (currentTabId && previousSourceKey && (currentTabId !== Number(tabId) || previousSourceKey !== nextSourceKey || forceReset)) {
    await persistCurrentWorkspaceSession()
  }

  const changed = hasVideoChanged(currentVideoInfo, next)
  currentVideoInfo = next
  currentPageContext = nextContext
  currentTabId = Number(tabId) || 0
  if (workspaceContentBasisSignature) {
    setWorkspaceSnapshotStale(workspaceContentBasisSignature !== nextSignature)
  } else {
    setWorkspaceSnapshotStale(false)
  }
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: next.videoId,
    language: currentLanguage,
    forceReset: changed || forceReset,
  })
  updateVideoTitles(next.title)

  if (changed || forceReset) {
    if (await restoreWorkspaceSessionForTab(currentTabId, nextContext, next)) {
      return changed
    }
    abortCurrentSummary('video-changed')
    abortTimelineRequests()
    subtitlesRequestToken += 1
    setSubtitlesLoading(false)
    subtitleCache = buildSubtitleCache('', [])
    refreshWorkspaceMeta()
    resetSummaryContent()
    renderChatMessages()
    showState('ready')
  }

  return changed
}

async function applyWebpageContext(rawData, options = {}) {
  const { forceReset = false, tabId = 0 } = options
  const pageKey = String(rawData?.pageKey || rawData?.url || '').trim()
  if (!pageKey) return false

  const previousSourceKey = getWorkspaceSessionSourceKey()
  const nextContext = {
    sourceType: 'webpage',
    pageKey,
    title: String(rawData?.title || ''),
    url: String(rawData?.url || ''),
    canonicalUrl: String(rawData?.canonicalUrl || rawData?.url || ''),
    hostname: String(rawData?.hostname || ''),
    selectionText: String(rawData?.selectionText || ''),
    contentText: String(rawData?.contentText || ''),
    focusType: String(rawData?.focusType || 'page'),
    focusText: String(rawData?.focusText || rawData?.contentText || ''),
    extractState: String(rawData?.extractState || 'ready'),
  }
  const nextSignature = buildWorkspaceSourceSignature(nextContext)
  const nextSourceKey = getWorkspaceSessionSourceKey(nextContext)
  if (currentTabId && previousSourceKey && (currentTabId !== Number(tabId) || previousSourceKey !== nextSourceKey || forceReset)) {
    await persistCurrentWorkspaceSession()
  }

  const changed = currentPageContext?.sourceType !== 'webpage' || currentPageContext?.pageKey !== pageKey
  currentVideoInfo = null
  currentPageContext = nextContext
  currentTabId = Number(tabId) || 0
  if (workspaceContentBasisSignature) {
    setWorkspaceSnapshotStale(workspaceContentBasisSignature !== nextSignature)
  } else {
    setWorkspaceSnapshotStale(false)
  }
  pageChatSession = syncPageChatSession(pageChatSession, {
    pageKey,
    language: currentLanguage,
    forceReset: changed || forceReset,
  })
  updateVideoTitles(currentPageContext.title)

  if (changed || forceReset) {
    if (await restoreWorkspaceSessionForTab(currentTabId, nextContext)) {
      return changed
    }
    abortCurrentSummary('video-changed')
    abortTimelineRequests()
    subtitlesRequestToken += 1
    setSubtitlesLoading(false)
    subtitleCache = buildSubtitleCache('', [])
    refreshWorkspaceMeta()
    resetSummaryContent()
    renderChatMessages()
    showState('ready')
  }

  return changed
}

async function clearVideoInfo(error = 'UNSUPPORTED_PAGE', options = {}) {
  const { tabId = 0 } = options
  if (currentTabId && getWorkspaceSessionSourceKey()) {
    await persistCurrentWorkspaceSession()
  }

  currentVideoInfo = null
  currentPageContext = {
    sourceType: 'unsupported',
    error,
    title: '',
    url: '',
  }
  currentTabId = Number(tabId) || 0
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: '',
    language: currentLanguage,
    forceReset: true,
  })
  pageChatSession = syncPageChatSession(pageChatSession, {
    pageKey: '',
    language: currentLanguage,
    forceReset: true,
  })
  abortCurrentSummary('video-changed')
  abortTimelineRequests()
  subtitlesRequestToken += 1
  setSubtitlesLoading(false)
  subtitleCache = buildSubtitleCache('', [])
  refreshWorkspaceMeta()
  resetSummaryContent()
  renderChatMessages()
  showState('noVideo')
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab || null
}

async function requestVideoInfoFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_VIDEO_INFO' })
    if (response?.success && response?.data?.videoId) {
      return normalizeVideoInfo(response.data)
    }
  } catch {
    // content script may not be ready
  }
  return null
}

async function requestPageContextFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_CONTEXT' })
    if (response?.success && response?.data?.sourceType === 'webpage') {
      return response.data
    }
    if (response && typeof response === 'object') {
      return { error: response.error || '' }
    }
  } catch {
    // content script may not be ready
  }
  return null
}

async function syncVideoInfo(options = {}) {
  const { forceReset = false } = options
  const tab = await getActiveTab()

  const resolved = await resolveActivePageContext({
    tab,
    requestVideoInfo: requestVideoInfoFromTab,
    requestPageContext: requestPageContextFromTab,
  })

  if (resolved?.sourceType === 'youtube') {
    await applyVideoInfo(resolved, { forceReset, tabId: tab?.id || 0 })
    return true
  }

  if (resolved?.sourceType === 'webpage') {
    await applyWebpageContext(resolved, { forceReset, tabId: tab?.id || 0 })
    return true
  }

  await clearVideoInfo(resolved?.error || 'UNSUPPORTED_PAGE', { tabId: tab?.id || 0 })
  return false
}

function installNavigationListeners() {
  if (navigationListenersInstalled) return
  navigationListenersInstalled = true

  const safeSync = () => {
    syncVideoInfo()
      .then(() => maybeApplyPendingLaunchAction())
      .catch(() => {})
  }

  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (!changeInfo) return
      if (changeInfo.url || changeInfo.status === 'complete') {
        setTimeout(safeSync, 60)
        setTimeout(safeSync, 500)
      }
    })
  }

  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      setTimeout(safeSync, 60)
    })
  }

  if (chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      clearWorkspaceSessionsForTab(tabId).catch(() => {})
    })
  }

  window.addEventListener('focus', safeSync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistCurrentWorkspaceSession().catch(() => {})
      return
    }
    if (document.visibilityState === 'visible') {
      safeSync()
    }
  })
}

async function init() {
  const config = await loadConfig()
  currentLanguage = normalizeLanguage(config.language)
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: currentVideoInfo?.videoId || '',
    language: currentLanguage,
    forceReset: true,
  })
  applyStaticTranslations()
  refreshWorkspaceMeta()
  renderChatMessages()

  const configured = await isConfigured()
  if (!configured) {
    showState('unconfigured')
    return
  }

  await syncVideoInfo({ forceReset: true })
  await maybeApplyPendingLaunchAction()
  installNavigationListeners()

  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(() => {
    syncVideoInfo()
      .then(() => maybeApplyPendingLaunchAction())
      .catch(() => {})
  }, 1800)
}

async function startSummarize() {
  lastRequestedMode = 'summary'
  if (!currentPageContext?.sourceType || currentPageContext.sourceType === 'unsupported') {
    await syncVideoInfo()
  }

  if (currentPageContext?.sourceType === 'unsupported') {
    showError(currentLanguage === 'zh' ? '请打开可读取的网页或 YouTube 视频页' : 'Open a supported webpage or YouTube video page')
    return
  }

  showState('loading')
  setWorkspaceSnapshotStale(false)
  videoTitleLoadingEl.textContent = currentPageContext.title || currentVideoInfo?.title || t('unknownVideo')
  summaryOutputEl.textContent = ''
  setLoadingVisual(true, false)

  const config = await loadConfig()
  const configuredLanguage = normalizeLanguage(config.language)
  applyLanguageIfChanged(configuredLanguage)
  abortController = new AbortController()
  abortReason = ''
  let fullText = ''
  let firstChunkReceived = false

  try {
    if (isWebpageMode()) {
      const sourceText = currentPageContext.focusText || currentPageContext.contentText
      await appendPageSnapshot(pageChatSession, {
        contentText: currentPageContext.contentText,
        focusText: currentPageContext.focusText,
        pageChunks: chunkPageText(currentPageContext.contentText, { maxChars: 900 }),
        summaryDigest: pageChatSession.summaryDigest || '',
      })

      await streamChatReply(
        config,
        [
          {
            role: 'system',
            content: currentLanguage === 'zh'
              ? '你是一个网页内容总结助手。请基于当前网页内容输出清晰、结构化的摘要。若存在选中文本，优先围绕选中内容组织摘要。'
              : 'You are a webpage summarization assistant. Produce a clear, structured summary of the current webpage. When selected text exists, prioritize it as the focus of the summary.',
          },
          {
            role: 'user',
            content: [
              `Title: ${currentPageContext.title || ''}`,
              `URL: ${currentPageContext.url || ''}`,
              `Focus type: ${currentPageContext.focusType || 'page'}`,
              `Content:\n${sourceText}`,
            ].join('\n\n'),
          },
        ],
        (chunk) => {
          fullText += chunk
          summaryOutputEl.textContent = fullText
          if (!firstChunkReceived && fullText.trim()) {
            firstChunkReceived = true
            setLoadingVisual(true, true)
          }
          notifyEmbedResize()
        },
        abortController.signal
      )
    } else {
      const tab = await getActiveTab()
      if (!tab?.id) {
        showError(t('cannotIdentifyTab'))
        return
      }

      let transcriptResult

      try {
        transcriptResult = await requestTranscriptFromTab(tab.id, currentLanguage)
      } catch {
        showError(t('cannotConnectPage'), { errorCode: 'NEED_REFRESH' })
        return
      }

      if (!transcriptResult.success) {
        lastFailedMode = 'summary'
        showError(mapTranscriptError(transcriptResult.error), { errorCode: transcriptResult.error })
        return
      }

      subtitleCache = {
        ...buildSubtitleCache(
          currentVideoInfo.videoId,
          Array.isArray(transcriptResult.segments) ? transcriptResult.segments : [],
          transcriptResult.text || ''
        ),
      }
      refreshWorkspaceMeta()

      await streamSummarize(
        config,
        transcriptResult.text,
        (chunk) => {
          fullText += chunk
          summaryOutputEl.textContent = fullText
          if (!firstChunkReceived && fullText.trim()) {
            firstChunkReceived = true
            setLoadingVisual(true, true)
          }
          notifyEmbedResize()
        },
        abortController.signal
      )
    }

    setLoadingVisual(false)
    summaryResultEl.innerHTML = marked.parse(fullText)
    workspaceContentBasisSignature = buildWorkspaceSourceSignature(currentPageContext, currentVideoInfo)
    setWorkspaceSnapshotStale(false)
    if (isWebpageMode()) {
      pageChatSession.summaryDigest = String(summaryResultEl.innerText || fullText || '').trim()
    } else {
      videoChatSession.summaryDigest = String(summaryResultEl.innerText || fullText || '').trim()
    }
    videoTitleDoneEl.textContent = currentPageContext?.title || currentVideoInfo?.title || t('unknownVideo')
    showState('done')
    notifyEmbedResize()
    schedulePersistCurrentWorkspaceSession(80)
  } catch (err) {
    setLoadingVisual(false)
    if (err.name === 'AbortError') {
      const reason = abortReason
      abortReason = ''

      if (reason === 'video-changed') {
        resetSummaryContent()
        showState(currentPageContext?.sourceType === 'unsupported' ? 'noVideo' : 'ready')
        return
      }

      summaryResultEl.textContent = fullText || t('cancelled')
      videoTitleDoneEl.textContent = currentPageContext?.title || currentVideoInfo?.title || t('unknownVideo')
      showState('done')
      notifyEmbedResize()
      schedulePersistCurrentWorkspaceSession(80)
    } else {
      lastFailedMode = 'summary'
      showError(`${t('apiFailed')}: ${err.message}`)
    }
  } finally {
    abortController = null
  }
}

async function exportOriginalSubtitles() {
  if (isWebpageMode()) {
    showError(currentLanguage === 'zh' ? '网页模式暂不支持字幕导出' : 'Subtitle export is only available for YouTube mode')
    return
  }

  if (!currentVideoInfo?.videoId) {
    await syncVideoInfo()
  }

  if (!currentVideoInfo?.videoId) {
    showError(t('openYoutubeFirst'))
    return
  }

  const tab = await getActiveTab()
  if (!tab?.id) {
    showError(t('cannotIdentifyTab'))
    return
  }

  setSubtitlesExporting(true)

  try {
    const transcriptResult = await requestOriginalTranscriptFromTab(tab.id, currentLanguage)
    if (!transcriptResult?.success) {
      showError(`${t('exportFailed')}: ${mapTranscriptError(transcriptResult?.error)}`, { errorCode: transcriptResult?.error })
      return
    }

    const content = buildSrtContent(transcriptResult.segments || [])
    if (!content) {
      showError(`${t('exportFailed')}: ${t('emptyTranscript')}`)
      return
    }

    downloadTextFile(buildSubtitleExportFilename(currentVideoInfo?.title), content)
  } catch (error) {
    showError(`${t('exportFailed')}: ${error?.message || t('unknownError')}`)
  } finally {
    setSubtitlesExporting(false)
  }
}

function showError(msg, options = {}) {
  lastErrorCode = String(options.errorCode || '')
  setLoadingVisual(false)
  errorMsgEl.textContent = msg
  showState('error')
  notifyEmbedResize()
  schedulePersistCurrentWorkspaceSession(80)
}

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

openOptionsIconEl.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

langToggleBtnEl.addEventListener('click', () => {
  switchLanguage()
})

document.getElementById('summarize-btn').addEventListener('click', startSummarize)

workspaceTabSummaryEl?.addEventListener('click', () => {
  showState(states.done.style.display === 'flex' ? 'done' : states.loading.style.display === 'flex' ? 'loading' : 'ready')
  switchWorkspaceTab('summary')
})

workspaceTabChatEl?.addEventListener('click', () => {
  openChatWorkspace()
})

workspaceTabTimelineEl?.addEventListener('click', () => {
  openSubtitlesView(false)
})

viewSubtitlesBtnEl.addEventListener('click', () => {
  openSubtitlesView(false)
})

doneSubtitlesBtnEl.addEventListener('click', () => {
  openSubtitlesView(false)
})

subtitlesRefreshBtnEl.addEventListener('click', () => {
  openSubtitlesView(true)
})

subtitlesBackBtnEl.addEventListener('click', () => {
  abortTimelineRequests()
  subtitlesRequestToken += 1
  setSubtitlesLoading(false)
  showState(previousStateBeforeSubtitles)
  switchWorkspaceTab('summary')
})

exportButtons.forEach((button) => {
  button.addEventListener('click', () => {
    exportOriginalSubtitles()
  })
})

subtitlesListEl.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!target.classList.contains('subtitle-time')) return

  const startSec = Number(target.dataset.startSec)
  if (!Number.isFinite(startSec) || startSec < 0) return
  seekVideoTo(startSec)
})

chatMessagesEl?.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!target.classList.contains('chat-citation')) return

  const startSec = Number(target.dataset.startSec)
  if (!Number.isFinite(startSec) || startSec < 0) return
  switchWorkspaceTab('timeline')
  seekVideoTo(startSec)
})

chatFormEl?.addEventListener('submit', submitChatQuestion)
chatRestartBtnEl?.addEventListener('click', restartChatSession)

document.getElementById('cancel-btn').addEventListener('click', () => {
  abortCurrentSummary('user-cancel')
})

document.getElementById('copy-btn').addEventListener('click', () => {
  copyTextToClipboard(summaryResultEl.innerText)
})
summaryRefreshBtnEl?.addEventListener('click', () => {
  startSummarize()
})

document.getElementById('retry-btn').addEventListener('click', startSummarize)

noVideoRetryBtnEl?.addEventListener('click', () => {
  reloadCurrentTab().catch(() => {})
})

document.getElementById('error-retry-btn').addEventListener('click', () => {
  if (shouldOfferPageReload(lastErrorCode)) {
    reloadCurrentTab().catch(() => {})
    return
  }

  if (lastFailedMode === 'timeline' || lastRequestedMode === 'timeline') {
    openSubtitlesView(true)
    return
  }

  startSummarize()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VIDEO_DETECTED') {
    const senderTabId = sender?.tab?.id
    if (!senderTabId) {
      sendResponse({ success: false })
      return true
    }

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(async ([activeTab]) => {
        if (!activeTab || activeTab.id !== senderTabId) {
          sendResponse({ success: false })
          return
        }
        await applyVideoInfo(message.data, { tabId: senderTabId })
        sendResponse({ success: true })
      })
      .catch(() => {
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === 'PANEL_LAUNCH_ACTION') {
    applyLaunchAction(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }))
    return true
  }
})

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.language) return
    applyLanguageIfChanged(changes.language.newValue)
  })
}

init()
notifyEmbedResize()
