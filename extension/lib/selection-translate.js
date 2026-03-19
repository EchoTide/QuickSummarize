import { translateSelectionText } from './deepl.js'

const TOOLBAR_ID = '__qs-selection-toolbar__'
const TOOLTIP_ID = '__qs-selection-translate__'
const TOOLBAR_CLASS = 'selection-toolbar'
const MAX_SELECTION_CHARS = 1200

function normalizeSelectionText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function getSelectionRect() {
  const selection = window.getSelection?.()
  if (!selection?.rangeCount || selection.isCollapsed) return null
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) return null
  return rect
}

function ensureTooltip() {
  let tooltip = document.getElementById(TOOLTIP_ID)
  if (tooltip) return tooltip

  tooltip = document.createElement('div')
  tooltip.id = TOOLTIP_ID
  tooltip.style.position = 'fixed'
  tooltip.style.zIndex = '2147483647'
  tooltip.style.maxWidth = '320px'
  tooltip.style.padding = '10px 12px'
  tooltip.style.borderRadius = '12px'
  tooltip.style.background = 'linear-gradient(165deg, rgba(17, 20, 28, 0.96), rgba(38, 48, 79, 0.94))'
  tooltip.style.color = '#f7f8fb'
  tooltip.style.fontFamily = "'Sora', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  tooltip.style.fontSize = '13px'
  tooltip.style.lineHeight = '1.45'
  tooltip.style.boxShadow = '0 16px 32px rgba(15, 20, 35, 0.22)'
  tooltip.style.border = '1px solid rgba(255, 255, 255, 0.12)'
  tooltip.style.whiteSpace = 'pre-wrap'
  tooltip.style.wordBreak = 'break-word'
  tooltip.style.pointerEvents = 'none'
  tooltip.style.opacity = '0'
  tooltip.style.transform = 'translateY(4px)'
  tooltip.style.transition = 'opacity 0.16s ease, transform 0.16s ease'
  document.documentElement.appendChild(tooltip)
  return tooltip
}

function hideTooltip() {
  const tooltip = document.getElementById(TOOLTIP_ID)
  if (!tooltip) return
  tooltip.style.opacity = '0'
  tooltip.style.transform = 'translateY(4px)'
}

function placeElement(element, left, top) {
  element.style.left = '12px'
  element.style.top = '12px'
  const rect = element.getBoundingClientRect()
  const nextLeft = Math.max(12, Math.min(left, window.innerWidth - rect.width - 12))
  const nextTop = Math.max(12, Math.min(top, window.innerHeight - rect.height - 12))
  element.style.left = `${nextLeft}px`
  element.style.top = `${nextTop}px`
}

function showTooltip(text, rect = getSelectionRect()) {
  const tooltip = ensureTooltip()
  tooltip.textContent = String(text || '').trim()
  const left = rect ? rect.left + Math.min(24, rect.width / 2) : 24
  const top = rect ? Math.max(12, rect.bottom + 10) : 24
  placeElement(tooltip, left, top)
  tooltip.style.opacity = '1'
  tooltip.style.transform = 'translateY(0)'
}

function ensureToolbar() {
  let toolbar = document.getElementById(TOOLBAR_ID)
  if (toolbar) return toolbar

  toolbar = document.createElement('div')
  toolbar.id = TOOLBAR_ID
  toolbar.className = TOOLBAR_CLASS
  toolbar.style.position = 'fixed'
  toolbar.style.zIndex = '2147483647'
  toolbar.style.display = 'none'
  toolbar.style.alignItems = 'center'
  toolbar.style.gap = '8px'
  toolbar.style.padding = '6px'
  toolbar.style.borderRadius = '14px'
  toolbar.style.background = 'rgba(255, 255, 255, 0.96)'
  toolbar.style.border = '1px solid rgba(19, 25, 38, 0.12)'
  toolbar.style.boxShadow = '0 14px 28px rgba(15, 20, 35, 0.18)'
  toolbar.style.backdropFilter = 'blur(10px)'

  const brand = document.createElement('div')
  brand.dataset.role = 'brand'
  brand.style.display = 'flex'
  brand.style.alignItems = 'center'
  brand.style.gap = '8px'
  brand.style.padding = '0 6px 0 2px'

  const brandBadge = document.createElement('span')
  brandBadge.textContent = 'Q'
  brandBadge.setAttribute('aria-hidden', 'true')
  brandBadge.style.width = '24px'
  brandBadge.style.height = '24px'
  brandBadge.style.borderRadius = '8px'
  brandBadge.style.display = 'inline-flex'
  brandBadge.style.alignItems = 'center'
  brandBadge.style.justifyContent = 'center'
  brandBadge.style.background = 'linear-gradient(135deg, #0f62fe, #2a8cff 60%, #72b7ff)'
  brandBadge.style.color = '#ffffff'
  brandBadge.style.font = "700 12px 'Sora', 'Noto Sans SC', sans-serif"
  brandBadge.style.boxShadow = '0 8px 16px rgba(15, 98, 254, 0.24)'

  const brandText = document.createElement('span')
  brandText.textContent = 'QuickSummarize'
  brandText.style.color = '#0f172a'
  brandText.style.font = "700 11px 'Sora', 'Noto Sans SC', sans-serif"
  brandText.style.letterSpacing = '0.01em'

  brand.appendChild(brandBadge)
  brand.appendChild(brandText)

  const translateButton = document.createElement('button')
  translateButton.type = 'button'
  translateButton.dataset.role = 'translate'
  translateButton.textContent = 'Translate'
  translateButton.style.border = 'none'
  translateButton.style.borderRadius = '10px'
  translateButton.style.background = 'linear-gradient(135deg, #1f6feb, #0f62fe)'
  translateButton.style.color = '#fff'
  translateButton.style.padding = '7px 12px'
  translateButton.style.font = "600 12px 'Sora', 'Noto Sans SC', sans-serif"
  translateButton.style.cursor = 'pointer'

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.dataset.role = 'close'
  closeButton.textContent = '×'
  closeButton.setAttribute('aria-label', 'Close')
  closeButton.style.width = '28px'
  closeButton.style.height = '28px'
  closeButton.style.border = 'none'
  closeButton.style.borderRadius = '10px'
  closeButton.style.background = 'rgba(15, 23, 42, 0.08)'
  closeButton.style.color = '#344054'
  closeButton.style.fontSize = '16px'
  closeButton.style.cursor = 'pointer'

  toolbar.appendChild(brand)
  toolbar.appendChild(translateButton)
  toolbar.appendChild(closeButton)
  document.documentElement.appendChild(toolbar)
  return toolbar
}

function hideToolbar() {
  const toolbar = document.getElementById(TOOLBAR_ID)
  if (!toolbar) return
  toolbar.style.display = 'none'
}

function showToolbar(rect) {
  const toolbar = ensureToolbar()
  toolbar.style.display = 'flex'
  placeElement(toolbar, rect.left, Math.max(12, rect.top - 48))
}

function getLocaleText(language = 'en') {
  if (String(language || '').toLowerCase() === 'zh') {
    return {
      translate: '翻译',
      translating: '翻译中...',
      missingKey: '请先在设置中填写 DeepL Key。',
      disabled: '请先在设置中开启划词翻译。',
      tooLong: '选中文本太长，暂不翻译。',
      failed: '翻译失败：',
    }
  }

  return {
    translate: 'Translate',
    translating: 'Translating...',
    missingKey: 'Add your DeepL key in settings first.',
    disabled: 'Enable selection translation in settings first.',
    tooLong: 'Selection is too long to translate.',
    failed: 'Translation failed: ',
  }
}

export function installSelectionTranslation({ loadConfig }) {
  if (window.__qsSelectionTranslationInstalled) return
  window.__qsSelectionTranslationInstalled = true

  let activeSelectionText = ''
  let activeRect = null

  const refreshToolbarLabels = async () => {
    const toolbar = ensureToolbar()
    const button = toolbar.querySelector('[data-role="translate"]')
    const config = await loadConfig().catch(() => ({ language: 'en' }))
    const textTable = getLocaleText(config?.language)
    button.textContent = 'Translate'
    button.setAttribute('aria-label', textTable.translate)
    button.setAttribute('title', textTable.translate)
  }

  const onTranslate = async () => {
    const config = await loadConfig().catch(() => null)
    const language = config?.language || 'en'
    const textTable = getLocaleText(language)
    const text = normalizeSelectionText(window.getSelection?.()?.toString?.() || activeSelectionText)
    const rect = getSelectionRect() || activeRect

    if (!config?.selectionTranslationEnabled) {
      showTooltip(textTable.disabled, rect)
      return
    }
    if (!String(config?.deeplApiKey || '').trim()) {
      showTooltip(textTable.missingKey, rect)
      return
    }
    if (!text) {
      hideToolbar()
      return
    }
    if (text.length > MAX_SELECTION_CHARS) {
      showTooltip(textTable.tooLong, rect)
      return
    }

    showTooltip(textTable.translating, rect)

    try {
      const result = await translateSelectionText(text, {
        apiKey: config.deeplApiKey,
        language,
        targetLanguage: config.selectionTargetLanguage || '',
      })
      showTooltip(result.translatedText, rect)
    } catch (error) {
      showTooltip(`${textTable.failed}${String(error?.message || '').trim() || 'Unknown error'}`, rect)
    }
  }

  const toolbar = ensureToolbar()
  toolbar.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  toolbar.addEventListener('click', (event) => {
    const role = event.target?.dataset?.role
    if (role === 'close') {
      hideToolbar()
      hideTooltip()
      return
    }
    if (role === 'translate') {
      onTranslate().catch(() => {})
    }
  })

  document.addEventListener('mouseup', () => {
    window.setTimeout(() => {
      const text = normalizeSelectionText(window.getSelection?.()?.toString?.() || '')
      const rect = getSelectionRect()
      if (!text || !rect) {
        hideToolbar()
        return
      }
      activeSelectionText = text
      activeRect = rect
      refreshToolbarLabels().catch(() => {})
      showToolbar(rect)
    }, 0)
  })

  document.addEventListener('mousedown', (event) => {
    const toolbarEl = document.getElementById(TOOLBAR_ID)
    if (toolbarEl?.contains(event.target)) return
    hideToolbar()
    hideTooltip()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideToolbar()
      hideTooltip()
    }
  })

  window.addEventListener('scroll', () => {
    hideToolbar()
    hideTooltip()
  }, true)
}
