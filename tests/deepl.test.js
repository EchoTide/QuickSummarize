import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  resolveDeepLApiUrl,
  getDeepLTargetLanguage,
  translateSelectionText,
} from '../extension/lib/deepl.js'

describe('resolveDeepLApiUrl', () => {
  it('uses the free endpoint for free-auth keys', () => {
    expect(resolveDeepLApiUrl('test-key:fx')).toBe('https://api-free.deepl.com/v2/translate')
  })

  it('uses the pro endpoint for regular keys', () => {
    expect(resolveDeepLApiUrl('test-key')).toBe('https://api.deepl.com/v2/translate')
  })
})

describe('getDeepLTargetLanguage', () => {
  it('maps chinese ui language to chinese target output', () => {
    expect(getDeepLTargetLanguage('zh')).toBe('ZH')
  })

  it('maps english ui language to english target output', () => {
    expect(getDeepLTargetLanguage('en')).toBe('EN-US')
  })
})

describe('translateSelectionText', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the runtime proxy and returns the translated text', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          expect(message.type).toBe('PROXY_FETCH')
          expect(String(message.data.url)).toBe('https://api-free.deepl.com/v2/translate')

          const body = JSON.parse(String(message.data.options.body))
          expect(body.text).toEqual(['Hello world'])
          expect(body.target_lang).toBe('ZH')

          callback({
            success: true,
            text: JSON.stringify({
              translations: [
                {
                  detected_source_language: 'EN',
                  text: 'translated hello world',
                },
              ],
            }),
          })
        },
      },
    }

    const result = await translateSelectionText('Hello world', {
      apiKey: 'test-key:fx',
      language: 'zh',
    })

    expect(result).toEqual({
      translatedText: 'translated hello world',
      detectedSourceLanguage: 'EN',
    })
  })

  it('throws a readable error when the proxy returns a failure', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(_message, callback) {
          callback({
            success: false,
            error: 'HTTP_ERROR',
            text: 'Authorization failed',
          })
        },
      },
    }

    await expect(
      translateSelectionText('Hello world', {
        apiKey: 'test-key',
        language: 'en',
      })
    ).rejects.toThrow('Authorization failed')
  })
})
