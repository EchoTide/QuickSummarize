function getRuntime() {
  const runtime = globalThis.chrome?.runtime
  if (!runtime?.sendMessage) {
    throw new Error('Chrome runtime is unavailable')
  }
  return runtime
}

export function resolveDeepLApiUrl(apiKey = '') {
  const trimmed = String(apiKey || '').trim()
  const isFreeKey = trimmed.endsWith(':fx')
  return isFreeKey
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

export function getDeepLTargetLanguage(language = 'en', configuredTargetLanguage = '') {
  const explicitTarget = String(configuredTargetLanguage || '').trim().toUpperCase()
  if (explicitTarget) return explicitTarget
  return String(language || '').toLowerCase() === 'zh' ? 'ZH' : 'EN-US'
}

function parseProxyError(response) {
  const preview = String(response?.text || '').trim()
  if (preview) {
    try {
      const parsed = JSON.parse(preview)
      const message = parsed?.message || parsed?.error?.message
      if (message) return String(message)
    } catch {
      // fall through to raw preview
    }
    return preview
  }

  return String(response?.error || 'Translation failed')
}

export async function translateSelectionText(text, { apiKey, language = 'en', targetLanguage = '' } = {}) {
  const trimmedText = String(text || '').trim()
  const trimmedKey = String(apiKey || '').trim()

  if (!trimmedText) throw new Error('No text selected')
  if (!trimmedKey) throw new Error('DeepL API key is missing')

  const runtime = getRuntime()
  const response = await new Promise((resolve) => {
    runtime.sendMessage(
      {
        type: 'PROXY_FETCH',
        data: {
          url: resolveDeepLApiUrl(trimmedKey),
          options: {
            method: 'POST',
            credentials: 'omit',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `DeepL-Auth-Key ${trimmedKey}`,
            },
            body: JSON.stringify({
              text: [trimmedText],
              target_lang: getDeepLTargetLanguage(language, targetLanguage),
            }),
          },
        },
      },
      resolve
    )
  })

  if (!response?.success) {
    throw new Error(parseProxyError(response))
  }

  let parsed = null
  try {
    parsed = JSON.parse(String(response.text || '{}'))
  } catch {
    throw new Error('Invalid translation response')
  }

  const translation = Array.isArray(parsed?.translations) ? parsed.translations[0] : null
  const translatedText = String(translation?.text || '').trim()

  if (!translatedText) {
    throw new Error('Empty translation response')
  }

  return {
    translatedText,
    detectedSourceLanguage: String(translation?.detected_source_language || '').trim(),
  }
}
