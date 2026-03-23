import { translateSelectionText } from './deepl.js'

const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'
const TWEET_TRANSLATION_ATTR = 'data-qsTweetTranslation'

function isXHost() {
  return window.location.hostname === 'x.com' || window.location.hostname === 'twitter.com'
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function getTranslationPalette() {
  const isDarkMode = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  if (isDarkMode) {
    return {
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      text: 'rgb(231, 233, 234)',
      label: 'rgb(113, 118, 123)',
    }
  }

  return {
    background: 'rgba(15, 20, 25, 0.03)',
    border: '1px solid rgba(15, 20, 25, 0.12)',
    text: 'rgb(15, 20, 25)',
    label: 'rgb(83, 100, 113)',
  }
}

function getLocaleText(language = 'en') {
  if (String(language || '').toLowerCase() === 'zh') {
    return {
      translate: '翻译推文',
      translating: '翻译中...',
      translated: '译文',
      missingKey: '请先在设置中填写 DeepL Key。',
      disabled: '请先在设置中开启划词翻译。',
      empty: '这条推文暂时没有可翻译的正文。',
      failed: '翻译失败：',
    }
  }

  return {
    translate: 'Translate post',
    translating: 'Translating...',
    translated: 'Translation',
    missingKey: 'Add your DeepL key in settings first.',
    disabled: 'Enable selection translation in settings first.',
    empty: 'This post does not have translatable text.',
    failed: 'Translation failed: ',
  }
}

function extractTweetId(article) {
  const links = Array.from(article.querySelectorAll('a[href*="/status/"]'))
  for (const link of links) {
    const href = String(link.getAttribute('href') || '')
    const match = href.match(/\/status\/(\d+)/)
    if (match?.[1]) return match[1]
  }
  return ''
}

function collectTweetText(article) {
  const blocks = Array.from(article.querySelectorAll(TWEET_TEXT_SELECTOR))
  return normalizeText(blocks.map((element) => element.innerText || element.textContent || '').join(' '))
}

function ensureTranslationStyles(container) {
  const palette = getTranslationPalette()

  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.gap = '6px'
  container.style.marginTop = '0'
  container.style.padding = '0'
  container.style.borderRadius = '16px'
  container.style.background = palette.background
  container.style.border = palette.border
  container.style.color = palette.text
  container.style.font = "500 15px 'Segoe UI', 'Noto Sans SC', sans-serif"
  container.style.lineHeight = '1.5'
  container.style.whiteSpace = 'pre-wrap'
  container.style.wordBreak = 'break-word'

  return palette
}

function buildControls(article) {
  const tweetText = article.querySelector(TWEET_TEXT_SELECTOR)
  if (!tweetText) return null

  const container = document.createElement('div')
  container.setAttribute(TWEET_TRANSLATION_ATTR, 'true')
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.alignItems = 'flex-start'
  container.style.gap = '8px'
  container.style.marginTop = '10px'

  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.role = 'tweet-translate'
  button.style.alignSelf = 'flex-start'
  button.style.border = 'none'
  button.style.borderRadius = '999px'
  button.style.padding = '2px 0'
  button.style.background = 'transparent'
  button.style.color = 'rgb(29, 155, 240)'
  button.style.font = "600 13px 'Segoe UI', 'Noto Sans SC', sans-serif"
  button.style.lineHeight = '1.4'
  button.style.cursor = 'pointer'

  container.appendChild(button)
  tweetText.insertAdjacentElement('afterend', container)

  return { button, container }
}

function createTranslationPanel(textTable) {
  const translation = document.createElement('div')
  translation.dataset.state = 'idle'
  const palette = ensureTranslationStyles(translation)
  translation.style.marginTop = '4px'
  translation.style.padding = '10px 12px'

  const label = document.createElement('div')
  label.textContent = textTable.translated
  label.style.color = palette.label
  label.style.font = "600 12px 'Segoe UI', 'Noto Sans SC', sans-serif"
  label.style.letterSpacing = '0.01em'
  translation.appendChild(label)

  const body = document.createElement('div')
  body.dataset.role = 'tweet-translation-body'
  translation.appendChild(body)

  return { translation, body, label }
}

export function installXTweetTranslation({ loadConfig }) {
  if (window.__qsXTweetTranslationInstalled) return
  window.__qsXTweetTranslationInstalled = true

  if (!isXHost()) return

  const translationCache = new Map()

  const mountArticle = (article) => {
    if (!(article instanceof HTMLElement)) return
    if (article.querySelector(`[${TWEET_TRANSLATION_ATTR}]`)) return
    const controls = buildControls(article)
    if (!controls) return

    const { button, container } = controls
    let translation = null
    let body = null
    let label = null

    const refreshLabel = async () => {
      const config = await loadConfig().catch(() => ({ language: 'en' }))
      const textTable = getLocaleText(config?.language)
      button.textContent = textTable.translate
      if (label) {
        label.textContent = textTable.translated
      }
    }

    button.addEventListener('click', () => {
      void (async () => {
        const config = await loadConfig().catch(() => null)
        const language = config?.language || 'en'
        const textTable = getLocaleText(language)
        const text = collectTweetText(article)
        const tweetId = extractTweetId(article)
        const cacheKey = [tweetId || text, language, config?.selectionTargetLanguage || ''].join('::')

        button.textContent = textTable.translating
        button.disabled = true

        if (!translation) {
          const panel = createTranslationPanel(textTable)
          translation = panel.translation
          body = panel.body
          label = panel.label
          container.appendChild(translation)
        }

        if (!config?.selectionTranslationEnabled) {
          translation.dataset.state = 'done'
          body.textContent = textTable.disabled
          button.textContent = textTable.translate
          button.disabled = false
          return
        }

        if (!String(config?.deeplApiKey || '').trim()) {
          translation.dataset.state = 'done'
          body.textContent = textTable.missingKey
          button.textContent = textTable.translate
          button.disabled = false
          return
        }

        if (!text) {
          translation.dataset.state = 'done'
          body.textContent = textTable.empty
          button.textContent = textTable.translate
          button.disabled = false
          return
        }

        const cached = translationCache.get(cacheKey)
        if (cached) {
          translation.dataset.state = 'done'
          body.textContent = cached
          button.textContent = textTable.translate
          button.disabled = false
          return
        }

        try {
          const result = await translateSelectionText(text, {
            apiKey: config.deeplApiKey,
            language,
            targetLanguage: config.selectionTargetLanguage || '',
          })
          translationCache.set(cacheKey, result.translatedText)
          translation.dataset.state = 'done'
          body.textContent = result.translatedText
        } catch (error) {
          translation.dataset.state = 'done'
          body.textContent = `${textTable.failed}${String(error?.message || '').trim() || 'Unknown error'}`
        } finally {
          button.textContent = textTable.translate
          button.disabled = false
        }
      })()
    })

    refreshLabel().catch(() => {})
  }

  const mountVisibleTweets = () => {
    const articles = document.querySelectorAll('article')
    for (const article of articles) {
      mountArticle(article)
    }
  }

  mountVisibleTweets()

  const observer = new MutationObserver(() => {
    mountVisibleTweets()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}
