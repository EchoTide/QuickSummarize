import { loadConfig, saveConfig, isConfigured } from './lib/storage.js'
import { streamSummarize } from './lib/llm.js'
import { extractVideoIdFromUrl, isYouTubeVideoUrl } from './lib/video-page.js'
import { hasVideoChanged, normalizeVideoInfo } from './lib/video-sync.js'
import { measureEmbedHeight } from './lib/embed-resize.js'
import { normalizeLanguage, nextLanguage, getLanguageToggleLabel } from './lib/i18n.js'
import { mergeSubtitleSegments, buildSrtContent } from './lib/subtitles.js'
import { summarizeTimelineChunks } from './lib/timeline-summary.js'
import { createVideoChatSession, appendTranscriptSnapshot, addChatTurn, compactSessionTurns } from './lib/chat-session.js'
import { chunkTranscriptSegments } from './lib/chat-context.js'
import { syncVideoChatSession } from './lib/video-chat-controller.js'
import { runVideoChatAgentTurn } from './lib/video-chat-agent.js'
import { renderChatContent, getChatRoleLabel } from './lib/chat-render.js'
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
let abortController = null
let abortReason = ''
let syncTimer = null
let navigationListenersInstalled = false
let resizeScheduled = false
let currentLanguage = 'en'
let previousStateBeforeSubtitles = 'ready'
let currentWorkspaceTab = 'summary'
let subtitlesLoading = false
let subtitlesExporting = false
let subtitlesRequestToken = 0
let lastRequestedMode = 'summary'
let lastFailedMode = 'summary'
let chatAbortController = null
let videoChatSession = createVideoChatSession({ videoId: '', language: 'en' })
let subtitleCache = {
  videoId: '',
  language: 'en',
  transcriptText: '',
  segments: [],
  mergedSegments: [],
  timelineByLanguage: {},
  timelinePendingByLanguage: {},
}

const TIMELINE_REQUEST_TIMEOUT_MS = 180000
const TIMELINE_TRANSCRIPT_RETRY_COUNT = 4
const TIMELINE_TRANSCRIPT_RETRY_DELAY_MS = 1000

const I18N = {
  en: {
    unconfigured: 'Configure API settings first',
    unconfiguredBody: 'Connect your model provider to unlock transcript summarization and chat.',
    openSettings: 'Open settings',
    noVideo: 'Open or refresh the YouTube page',
    noVideoBody: 'When a video is active, this workspace will load its transcript, summary, and timeline tools.',
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
    openYoutubeFirst: 'Open or refresh the YouTube page',
    cannotIdentifyTab: 'Cannot identify the current tab',
    cannotConnectPage: 'Cannot connect to the page. Refresh YouTube and try again',
    noCaptions: 'This video has no captions, so summarization is unavailable',
    manualCaptionsRequired:
      'Turn on YouTube captions manually, confirm they are visible on the video, then try summarizing or exporting again',
    emptyTranscript: 'Caption content is empty',
    fetchFailed: 'Failed to fetch captions. Please try again',
    noVideoId: 'No video detected. Open a YouTube video first',
    unknownError: 'Unknown error',
    cancelled: '(Cancelled)',
    apiFailed: 'API request failed',
    exportFailed: 'Subtitle export failed',
    switchLanguage: 'Switch language',
    openSettingsLabel: 'Open settings',
  },
  zh: {
    unconfigured: '请先配置 API 信息',
    unconfiguredBody: '先连接模型提供方，才能使用字幕总结和对话。',
    openSettings: '前往设置',
    noVideo: '请打开或刷新 YouTube 页面',
    noVideoBody: '检测到视频后，这里会加载对应的字幕、总结和时间线工具。',
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
    openYoutubeFirst: '请先打开或刷新 YouTube 页面',
    cannotIdentifyTab: '无法识别当前标签页',
    cannotConnectPage: '无法连接到页面，请刷新 YouTube 页面后重试',
    noCaptions: '该视频没有字幕，暂不支持总结',
    manualCaptionsRequired: '请先在 YouTube 播放器中手动打开字幕，并确认视频画面已显示字幕，再回来生成总结或导出字幕',
    emptyTranscript: '字幕内容为空',
    fetchFailed: '字幕获取失败，请重试',
    noVideoId: '未检测到视频，请先打开 YouTube 视频页',
    unknownError: '未知错误',
    cancelled: '（已取消）',
    apiFailed: 'API 调用失败',
    exportFailed: '字幕导出失败',
    switchLanguage: '切换语言',
    openSettingsLabel: '打开设置',
  },
}

function t(key) {
  const table = I18N[currentLanguage] || I18N.en
  return table[key] || I18N.en[key] || key
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en'
  unconfiguredTextEl.textContent = t('unconfigured')
  if (unconfiguredBodyEl) unconfiguredBodyEl.textContent = t('unconfiguredBody')
  openOptionsEl.textContent = t('openSettings')
  noVideoTextEl.textContent = t('noVideo')
  if (noVideoBodyEl) noVideoBodyEl.textContent = t('noVideoBody')
  summarizeBtnEl.textContent = t('summarize')
  viewSubtitlesBtnEl.textContent = t('subtitles')
  if (workspaceTabSummaryTitleEl) workspaceTabSummaryTitleEl.textContent = t('summarize')
  if (workspaceTabChatTitleEl) workspaceTabChatTitleEl.textContent = t('chat')
  if (workspaceTabTimelineTitleEl) workspaceTabTimelineTitleEl.textContent = t('subtitles')
  if (workspaceVideoEyebrowEl) workspaceVideoEyebrowEl.textContent = t('activeVideo')
  if (workspaceLanguageLabelEl) workspaceLanguageLabelEl.textContent = t('languageLabel')
  if (workspaceTranscriptLabelEl) workspaceTranscriptLabelEl.textContent = t('transcriptLabel')
  if (workspaceTabChatSubtitleEl) workspaceTabChatSubtitleEl.textContent = t('tabChatSubtitle')
  if (workspaceTabSummarySubtitleEl) workspaceTabSummarySubtitleEl.textContent = t('tabSummarySubtitle')
  if (workspaceTabTimelineSubtitleEl) workspaceTabTimelineSubtitleEl.textContent = t('tabTimelineSubtitle')
  exportButtons.forEach((button) => {
    button.textContent = subtitlesExporting ? t('exportSubtitlesLoading') : t('exportSubtitles')
  })
  doneSubtitlesBtnEl.textContent = t('subtitles')
  subtitlesRefreshBtnEl.textContent = t('refreshSubtitles')
  subtitlesBackBtnEl.textContent = t('back')
  loadingLabelEl.textContent = t('loading')
  cancelBtnEl.textContent = t('cancel')
  copyBtnEl.textContent = t('copy')
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
  refreshWorkspaceMeta()
}

function applyLanguageIfChanged(language) {
  const normalized = normalizeLanguage(language)
  if (normalized === currentLanguage) return
  currentLanguage = normalized
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: currentVideoInfo?.videoId || '',
    language: currentLanguage,
    forceReset: true,
  })
  applyStaticTranslations()
  updateVideoTitles(currentVideoInfo?.title)
  if (states.subtitles.style.display === 'flex') {
    openSubtitlesView(true).catch(() => {})
  }
  renderChatMessages()
  notifyEmbedResize()
}

async function switchLanguage() {
  const next = nextLanguage(currentLanguage)
  currentLanguage = next
  applyStaticTranslations()
  updateVideoTitles(currentVideoInfo?.title)
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
  if (workspaceLanguagePillEl) {
    workspaceLanguagePillEl.textContent = String(currentLanguage || 'en').toUpperCase()
  }

  if (workspaceTranscriptPillEl) {
    const hasTranscript = Boolean(String(subtitleCache?.transcriptText || '').trim())
    workspaceTranscriptPillEl.textContent = hasTranscript ? t('transcriptReady') : t('transcriptStandby')
    workspaceTranscriptPillEl.classList.toggle('is-muted', !hasTranscript)
  }
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
}

function renderChatMessages() {
  if (!chatMessagesEl) return
  chatMessagesEl.innerHTML = ''

  if (!Array.isArray(videoChatSession?.turns) || videoChatSession.turns.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'chat-empty'
    empty.textContent = currentLanguage === 'zh'
      ? '你可以直接问这条视频里的内容，例如：这段视频的核心观点是什么？'
      : 'Ask directly about this video, for example: what is the main argument in this video?'
    chatMessagesEl.appendChild(empty)
    notifyEmbedResize()
    return
  }

  const fragment = document.createDocumentFragment()
  for (const turn of videoChatSession.turns) {
    const item = document.createElement('div')
    item.className = `chat-message ${turn.role}`

    const role = document.createElement('div')
    role.className = 'chat-message-role'
    role.textContent = getChatRoleLabel(turn.role, currentLanguage)

    const content = document.createElement('div')
    content.className = 'chat-message-content'
    if (turn.role === 'assistant') {
      content.innerHTML = renderChatContent(turn.role, turn.content)
    } else {
      content.innerHTML = renderChatContent(turn.role, turn.content)
    }

    item.appendChild(role)
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
}

function restartChatSession() {
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }

  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: currentVideoInfo?.videoId || '',
    language: currentLanguage,
    forceReset: true,
  })
  renderChatMessages()
}

async function submitChatQuestion(event) {
  event?.preventDefault?.()

  const question = String(chatInputEl?.value || '').trim()
  if (!question) return

  const sessionReady = await ensureChatSession(false)
  if (!sessionReady?.success) {
    showError(mapTranscriptError(sessionReady?.error))
    return
  }

  switchWorkspaceTab('chat')
  addChatTurn(videoChatSession, { role: 'user', content: question })
  renderChatMessages()
  chatInputEl.value = ''
  if (chatSendBtnEl) chatSendBtnEl.disabled = true
  if (chatRestartBtnEl) chatRestartBtnEl.disabled = true

  const assistantTurn = { role: 'assistant', content: '', citations: [] }
  videoChatSession.turns.push(assistantTurn)
  renderChatMessages()
  let streamingAssistantContentEl = chatMessagesEl?.querySelector('.chat-message.assistant:last-child .chat-message-content') || null

  compactSessionTurns(videoChatSession, { keepLastTurns: 6 })

  chatAbortController = new AbortController()

  try {
    const agentResult = await runVideoChatAgentTurn({
      config: await loadConfig(),
      session: videoChatSession,
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
    addChatTurn(videoChatSession, {
      role: 'assistant',
      content: assistantTurn.content,
      citations: assistantTurn.citations,
    })
    videoChatSession.turns = videoChatSession.turns.filter((turn) => turn !== assistantTurn)
    compactSessionTurns(videoChatSession, { keepLastTurns: 6 })
    renderChatMessages()
  } catch (error) {
    videoChatSession.turns = videoChatSession.turns.filter((turn) => turn !== assistantTurn)
    showError(`${t('apiFailed')}: ${error?.message || t('unknownError')}`)
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
  lastRequestedMode = 'timeline'
  previousStateBeforeSubtitles = states.done.style.display === 'flex' ? 'done' : 'ready'
  const requestToken = ++subtitlesRequestToken
  updateVideoTitles(currentVideoInfo?.title)
  showState('subtitles')
  setSubtitlesLoading(true)
  renderSubtitlesLoading()

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
    showError(mapTranscriptError(transcriptResult?.error))
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
  } catch (error) {
    if (requestToken !== subtitlesRequestToken) return
    setSubtitlesLoading(false)
    lastFailedMode = 'timeline'
    showError(`${t('apiFailed')}: ${error?.message || 'unknown'}`)
  }
}

function abortCurrentSummary(reason = 'manual') {
  if (!abortController) return
  abortReason = reason
  abortController.abort()
}

function applyVideoInfo(rawData, options = {}) {
  const { forceReset = false } = options
  const next = normalizeVideoInfo(rawData)
  if (!next.videoId) return false

  const changed = hasVideoChanged(currentVideoInfo, next)
  currentVideoInfo = next
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: next.videoId,
    language: currentLanguage,
    forceReset: changed || forceReset,
  })
  updateVideoTitles(next.title)

  if (changed || forceReset) {
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

function clearVideoInfo() {
  currentVideoInfo = null
  videoChatSession = syncVideoChatSession(videoChatSession, {
    videoId: '',
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

async function syncVideoInfo(options = {}) {
  const { forceReset = false } = options
  const tab = await getActiveTab()

  if (!tab || !isYouTubeVideoUrl(tab.url || '')) {
    clearVideoInfo()
    return false
  }

  const liveInfo = await requestVideoInfoFromTab(tab.id)
  if (liveInfo?.videoId) {
    applyVideoInfo(liveInfo, { forceReset })
    return true
  }

  const fallbackVideoId = extractVideoIdFromUrl(tab.url || '')
  if (fallbackVideoId) {
    applyVideoInfo(
        {
          videoId: fallbackVideoId,
          title: t('extractingVideoInfo'),
        },
      { forceReset }
    )
    return true
  }

  clearVideoInfo()
  return false
}

function installNavigationListeners() {
  if (navigationListenersInstalled) return
  navigationListenersInstalled = true

  const safeSync = () => {
    syncVideoInfo().catch(() => {})
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

  window.addEventListener('focus', safeSync)
  document.addEventListener('visibilitychange', () => {
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
  installNavigationListeners()

  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(() => {
    syncVideoInfo().catch(() => {})
  }, 1800)
}

async function startSummarize() {
  lastRequestedMode = 'summary'
  if (!currentVideoInfo?.videoId) {
    await syncVideoInfo()
  }

  if (!currentVideoInfo?.videoId) {
    showError(t('openYoutubeFirst'))
    return
  }

  showState('loading')
  videoTitleLoadingEl.textContent = currentVideoInfo.title || t('unknownVideo')
  summaryOutputEl.textContent = ''
  setLoadingVisual(true, false)

  const tab = await getActiveTab()
  if (!tab?.id) {
    showError(t('cannotIdentifyTab'))
    return
  }

  let transcriptResult

  try {
    transcriptResult = await requestTranscriptFromTab(tab.id, currentLanguage)
  } catch (err) {
    showError(t('cannotConnectPage'))
    return
  }

  if (!transcriptResult.success) {
    lastFailedMode = 'summary'
    showError(mapTranscriptError(transcriptResult.error))
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

  const config = await loadConfig()
  const configuredLanguage = normalizeLanguage(config.language)
  applyLanguageIfChanged(configuredLanguage)
  abortController = new AbortController()
  abortReason = ''
  let fullText = ''
  let firstChunkReceived = false

  try {
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

    setLoadingVisual(false)
    summaryResultEl.innerHTML = marked.parse(fullText)
    videoChatSession.summaryDigest = String(summaryResultEl.innerText || fullText || '').trim()
    videoTitleDoneEl.textContent = currentVideoInfo?.title || t('unknownVideo')
    showState('done')
    notifyEmbedResize()
  } catch (err) {
    setLoadingVisual(false)
    if (err.name === 'AbortError') {
      const reason = abortReason
      abortReason = ''

      if (reason === 'video-changed') {
        resetSummaryContent()
        showState(currentVideoInfo?.videoId ? 'ready' : 'noVideo')
        return
      }

      summaryResultEl.textContent = fullText || t('cancelled')
      videoTitleDoneEl.textContent = currentVideoInfo?.title || t('unknownVideo')
      showState('done')
      notifyEmbedResize()
    } else {
      lastFailedMode = 'summary'
      showError(`${t('apiFailed')}: ${err.message}`)
    }
  } finally {
    abortController = null
  }
}

async function exportOriginalSubtitles() {
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
      showError(`${t('exportFailed')}: ${mapTranscriptError(transcriptResult?.error)}`)
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

function showError(msg) {
  setLoadingVisual(false)
  errorMsgEl.textContent = msg
  showState('error')
  notifyEmbedResize()
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
  navigator.clipboard.writeText(summaryResultEl.innerText)
})

document.getElementById('retry-btn').addEventListener('click', startSummarize)

document.getElementById('error-retry-btn').addEventListener('click', () => {
  if (lastFailedMode === 'timeline' || lastRequestedMode === 'timeline') {
    openSubtitlesView(true)
    return
  }

  startSummarize()
})

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'VIDEO_DETECTED') {
    const senderTabId = sender?.tab?.id
    if (!senderTabId) return

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([activeTab]) => {
        if (!activeTab || activeTab.id !== senderTabId) return
        applyVideoInfo(message.data)
      })
      .catch(() => {})
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
