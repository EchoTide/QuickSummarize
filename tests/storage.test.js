import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveConfig, loadConfig, isConfigured } from '../extension/lib/storage.js'

const mockStorage = {}
global.chrome = {
  storage: {
    local: {
      set: vi.fn((data) => Promise.resolve(Object.assign(mockStorage, data))),
      get: vi.fn((keys) => {
        const result = {}
        keys.forEach(k => { if (mockStorage[k] !== undefined) result[k] = mockStorage[k] })
        return Promise.resolve(result)
      }),
    },
  },
}

describe('storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k])
    vi.clearAllMocks()
  })

  it('should save and load config', async () => {
    const config = {
      provider: 'anthropic',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test-123',
      language: 'zh',
      autoOpenCaptions: true,
    }
    await saveConfig(config)
    const loaded = await loadConfig()
    expect(loaded.provider).toBe('anthropic')
    expect(loaded.baseUrl).toBe('https://api.openai.com/v1')
    expect(loaded.model).toBe('gpt-4o-mini')
    expect(loaded.apiKey).toBe('sk-test-123')
    expect(loaded.language).toBe('zh')
    expect(loaded.autoOpenCaptions).toBe(true)
  })

  it('should return empty strings when no config exists', async () => {
    const loaded = await loadConfig()
    expect(loaded.provider).toBe('openai')
    expect(loaded.baseUrl).toBe('')
    expect(loaded.model).toBe('')
    expect(loaded.apiKey).toBe('')
    expect(loaded.language).toBe('en')
    expect(loaded.autoOpenCaptions).toBe(false)
  })

  it('should detect unconfigured state', async () => {
    expect(await isConfigured()).toBe(false)
  })

  it('should detect configured state', async () => {
    await saveConfig({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-key',
    })
    expect(await isConfigured()).toBe(true)
  })

  it('should detect partially configured as not configured', async () => {
    await saveConfig({
      baseUrl: 'https://api.example.com/v1',
      model: '',
      apiKey: 'sk-key',
    })
    expect(await isConfigured()).toBe(false)
  })
})
