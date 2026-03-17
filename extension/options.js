import { saveConfig, loadConfig } from './lib/storage.js'

const form = document.getElementById('config-form')
const titleEl = document.getElementById('title')
const providerLabelEl = document.getElementById('provider-label')
const baseUrlLabelEl = document.getElementById('base-url-label')
const modelLabelEl = document.getElementById('model-label')
const apiKeyLabelEl = document.getElementById('api-key-label')
const languageLabelEl = document.getElementById('language-label')
const autoOpenCaptionsTextEl = document.getElementById('auto-open-captions-text')
const autoOpenCaptionsRiskEl = document.getElementById('auto-open-captions-risk')
const saveBtnEl = document.getElementById('save-btn')
const providerInput = document.getElementById('provider')
const baseUrlInput = document.getElementById('baseUrl')
const modelInput = document.getElementById('model')
const apiKeyInput = document.getElementById('apiKey')
const languageInput = document.getElementById('language')
const autoOpenCaptionsInput = document.getElementById('autoOpenCaptions')
const status = document.getElementById('status')

const I18N = {
  en: {
    title: 'QuickSummarize Settings',
    provider: 'Provider',
    baseUrl: 'API Base URL',
    model: 'Model',
    apiKey: 'API Key',
    language: 'Language',
    autoOpenCaptions: 'Automatically try to open captions (risky)',
    autoOpenCaptionsRisk:
      'When enabled, the extension may interact with the player and could be detected as automation.',
    save: 'Save',
    saved: 'Saved',
  },
  zh: {
    title: 'QuickSummarize 设置',
    provider: '接口类型',
    baseUrl: 'API 地址',
    model: '模型',
    apiKey: 'API Key',
    language: '语言',
    autoOpenCaptions: '自动尝试打开字幕（有风险）',
    autoOpenCaptionsRisk: '开启后插件可能会主动操作播放器，存在被平台识别为自动化行为的风险。',
    save: '保存',
    saved: '已保存',
  },
}

function t(language, key) {
  const table = I18N[language] || I18N.en
  return table[key] || I18N.en[key] || key
}

function applyTranslations(language) {
  const normalized = language === 'zh' ? 'zh' : 'en'
  document.documentElement.lang = normalized === 'zh' ? 'zh-CN' : 'en'
  titleEl.textContent = t(normalized, 'title')
  providerLabelEl.textContent = t(normalized, 'provider')
  baseUrlLabelEl.textContent = t(normalized, 'baseUrl')
  modelLabelEl.textContent = t(normalized, 'model')
  apiKeyLabelEl.textContent = t(normalized, 'apiKey')
  languageLabelEl.textContent = t(normalized, 'language')
  autoOpenCaptionsTextEl.textContent = t(normalized, 'autoOpenCaptions')
  autoOpenCaptionsRiskEl.textContent = t(normalized, 'autoOpenCaptionsRisk')
  saveBtnEl.textContent = t(normalized, 'save')
}

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig()
  providerInput.value = config.provider || 'openai'
  baseUrlInput.value = config.baseUrl
  modelInput.value = config.model
  apiKeyInput.value = config.apiKey
  languageInput.value = config.language || 'en'
  autoOpenCaptionsInput.checked = Boolean(config.autoOpenCaptions)
  applyTranslations(languageInput.value)
})

languageInput.addEventListener('change', () => {
  applyTranslations(languageInput.value)
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  await saveConfig({
    provider: providerInput.value,
    baseUrl: baseUrlInput.value.trim(),
    model: modelInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    language: languageInput.value,
    autoOpenCaptions: autoOpenCaptionsInput.checked,
  })
  status.textContent = t(languageInput.value, 'saved')
  setTimeout(() => { status.textContent = '' }, 2000)
})
