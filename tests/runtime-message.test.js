import { describe, it, expect, vi } from 'vitest'

import { sendRuntimeMessageSafely } from '../extension/lib/runtime-message.js'

describe('sendRuntimeMessageSafely', () => {
  it('consumes runtime.lastError when no receiver exists', async () => {
    const sendMessage = vi.fn((_message, callback) => {
      globalThis.chrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' }
      callback(undefined)
      globalThis.chrome.runtime.lastError = undefined
    })

    globalThis.chrome = {
      runtime: {
        sendMessage,
        lastError: undefined,
      },
    }

    await expect(sendRuntimeMessageSafely({ type: 'VIDEO_DETECTED' })).resolves.toBeUndefined()
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('resolves with the response when a receiver exists', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((_message, callback) => {
          callback({ ok: true })
        }),
        lastError: undefined,
      },
    }

    await expect(sendRuntimeMessageSafely({ type: 'VIDEO_DETECTED' })).resolves.toEqual({ ok: true })
  })
})
