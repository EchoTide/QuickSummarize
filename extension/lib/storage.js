const KEYS = ['provider', 'baseUrl', 'model', 'apiKey', 'language', 'autoOpenCaptions', 'selectionTranslationEnabled', 'deeplApiKey', 'selectionTargetLanguage']

export async function saveConfig({
  provider = 'openai',
  baseUrl,
  model,
  apiKey,
  language = 'en',
  autoOpenCaptions = false,
  selectionTranslationEnabled = false,
  deeplApiKey,
  selectionTargetLanguage = '',
}) {
  await chrome.storage.local.set({
    provider,
    baseUrl,
    model,
    apiKey,
    language,
    autoOpenCaptions: Boolean(autoOpenCaptions),
    selectionTranslationEnabled: Boolean(selectionTranslationEnabled),
    deeplApiKey,
    selectionTargetLanguage,
  })
}

export async function loadConfig() {
  const result = await chrome.storage.local.get(KEYS)
  return {
    provider: result.provider || 'openai',
    baseUrl: result.baseUrl || '',
    model: result.model || '',
    apiKey: result.apiKey || '',
    language: result.language || 'en',
    autoOpenCaptions: Boolean(result.autoOpenCaptions),
    selectionTranslationEnabled: Boolean(result.selectionTranslationEnabled),
    deeplApiKey: result.deeplApiKey || '',
    selectionTargetLanguage: result.selectionTargetLanguage || '',
  }
}

export async function isConfigured() {
  const config = await loadConfig()
  return config.baseUrl !== '' && config.model !== '' && config.apiKey !== ''
}
