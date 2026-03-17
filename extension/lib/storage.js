const KEYS = ['baseUrl', 'model', 'apiKey', 'language', 'autoOpenCaptions']

export async function saveConfig({
  baseUrl,
  model,
  apiKey,
  language = 'en',
  autoOpenCaptions = false,
}) {
  await chrome.storage.local.set({
    baseUrl,
    model,
    apiKey,
    language,
    autoOpenCaptions: Boolean(autoOpenCaptions),
  })
}

export async function loadConfig() {
  const result = await chrome.storage.local.get(KEYS)
  return {
    baseUrl: result.baseUrl || '',
    model: result.model || '',
    apiKey: result.apiKey || '',
    language: result.language || 'en',
    autoOpenCaptions: Boolean(result.autoOpenCaptions),
  }
}

export async function isConfigured() {
  const config = await loadConfig()
  return config.baseUrl !== '' && config.model !== '' && config.apiKey !== ''
}
