import { describe, it, expect } from 'vitest'
import {
  buildRequestBody,
  completeChat,
  completeChatStream,
  SYSTEM_PROMPT_EN,
  SYSTEM_PROMPT_ZH,
  parseSSELine,
  streamSummarize,
} from '../extension/lib/llm.js'

describe('buildRequestBody', () => {
  it('should build english request body by default', () => {
    const body = buildRequestBody('gpt-4o-mini', 'Hello world transcript text')
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT_EN)
    expect(body.messages[1].role).toBe('user')
    expect(body.messages[1].content).toBe('Hello world transcript text')
  })

  it('should build chinese request body when language is zh', () => {
    const body = buildRequestBody('gpt-4o-mini', 'Hello world transcript text', 'zh')
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT_ZH)
  })
})

describe('parseSSELine', () => {
  it('should parse data line with content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
    const result = parseSSELine(line)
    expect(result).toBe('Hello')
  })

  it('should return null for [DONE]', () => {
    const line = 'data: [DONE]'
    const result = parseSSELine(line)
    expect(result).toBeNull()
  })

  it('should return null for empty line', () => {
    const result = parseSSELine('')
    expect(result).toBeNull()
  })

  it('should return null for comment line', () => {
    const result = parseSSELine(': keep-alive')
    expect(result).toBeNull()
  })

  it('should return empty string for delta without content', () => {
    const line = 'data: {"choices":[{"delta":{}}]}'
    const result = parseSSELine(line)
    expect(result).toBe('')
  })

  it('should strip think tags from content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello<think>internal reasoning</think>World"}}]}'
    const result = parseSSELine(line)
    expect(result).toBe('HelloWorld')
  })

  it('should strip incomplete think tag without closing', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello<think>internal reasoning"}}]}'
    const result = parseSSELine(line)
    expect(result).toBe('Hello')
  })

  it('should handle multiline think content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Start<think>line1\\nline2\\nline3</think>End"}}]}'
    const result = parseSSELine(line)
    expect(result).toBe('StartEnd')
  })

  it('should ignore reasoning_content-only delta', () => {
    const line = 'data: {"choices":[{"delta":{"reasoning_content":"Let me think..."}}]}'
    const result = parseSSELine(line)
    expect(result).toBe('')
  })
})

describe('streamSummarize', () => {
  it('should stream via extension runtime port and emit chunks incrementally', async () => {
    const messageListeners = []
    const disconnectListeners = []

    const port = {
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener)
        },
        removeListener(listener) {
          const index = messageListeners.indexOf(listener)
          if (index >= 0) messageListeners.splice(index, 1)
        },
      },
      onDisconnect: {
        addListener(listener) {
          disconnectListeners.push(listener)
        },
        removeListener(listener) {
          const index = disconnectListeners.indexOf(listener)
          if (index >= 0) disconnectListeners.splice(index, 1)
        },
      },
      postMessage(message) {
        if (message.type === 'START') {
          messageListeners.forEach((listener) =>
            listener({
              type: 'CHUNK',
              chunk: 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
            })
          )
          messageListeners.forEach((listener) =>
            listener({
              type: 'CHUNK',
              chunk: 'data: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n',
            })
          )
          messageListeners.forEach((listener) => listener({ type: 'END' }))
        }
      },
    }

    globalThis.chrome = {
      runtime: {
        connect() {
          return port
        },
        sendMessage() {
          throw new Error('sendMessage should not be used when stream port is available')
        },
      },
    }

    const chunks = []
    await streamSummarize(
      { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.5', apiKey: 'key' },
      'transcript',
      (chunk) => chunks.push(chunk)
    )

    expect(chunks.join('')).toBe('Hello world')
    expect(disconnectListeners.length).toBeGreaterThanOrEqual(0)
  })

  it('should stream via extension proxy fetch and parse SSE content', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          callback({
            success: true,
            text: [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":" world"}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          })
        },
      },
    }

    const chunks = []
    await streamSummarize(
      { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.5', apiKey: 'key' },
      'transcript',
      (chunk) => chunks.push(chunk)
    )

    expect(chunks.join('')).toBe('Hello world')
  })

  it('should drop leading English reasoning and keep Chinese summary output', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          callback({
            success: true,
            text: [
              'data: {"choices":[{"delta":{"content":"Let me analyze the content first. "}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"The video is about AI tools. "}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"视频摘要\\n主题：这是一个测试。"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"\\n核心内容：\\n- 要点A"}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          })
        },
      },
    }

    const chunks = []
    await streamSummarize(
      {
        baseUrl: 'https://api.minimaxi.com/v1',
        model: 'MiniMax-M2.5',
        apiKey: 'key',
        language: 'zh',
      },
      'transcript',
      (chunk) => chunks.push(chunk)
    )

    expect(chunks.join('')).toContain('视频摘要')
    expect(chunks.join('')).not.toContain('Let me analyze')
    expect(chunks.join('')).not.toContain('The video is about')
  })

  it('should keep english summary lines when language is en', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          callback({
            success: true,
            text: [
              'data: {"choices":[{"delta":{"content":"The video is about AI tools."}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          })
        },
      },
    }

    const chunks = []
    await streamSummarize(
      {
        baseUrl: 'https://api.minimaxi.com/v1',
        model: 'MiniMax-M2.5',
        apiKey: 'key',
        language: 'en',
      },
      'transcript',
      (chunk) => chunks.push(chunk)
    )

    expect(chunks.join('')).toContain('The video is about AI tools.')
  })
})

describe('completeChat', () => {
  it('returns assistant content from runtime proxy json response', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(_message, callback) {
          callback({
            success: true,
            text: JSON.stringify({
              choices: [{ message: { content: 'translated text' } }],
            }),
          })
        },
      },
    }

    const content = await completeChat(
      { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.5', apiKey: 'key' },
      [{ role: 'user', content: 'hello' }]
    )

    expect(content).toBe('translated text')
  })

  it('formats proxy error objects into readable message', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(_message, callback) {
          callback({
            success: false,
            status: 429,
            error: { message: 'rate limited', code: 'TOO_MANY_REQUESTS' },
            text: 'slow down',
          })
        },
      },
    }

    await expect(
      completeChat(
        { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.5', apiKey: 'key' },
        [{ role: 'user', content: 'hello' }]
      )
    ).rejects.toThrow('rate limited')
  })
})

describe('completeChatStream', () => {
  it('uses stream=true and collects SSE content from runtime proxy', async () => {
    const capturedBodies = []

    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          capturedBodies.push(JSON.parse(String(message?.data?.options?.body || '{}')))
          callback({
            success: true,
            text: [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":" world"}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          })
        },
      },
    }

    const content = await completeChatStream(
      { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.5', apiKey: 'key' },
      [{ role: 'user', content: 'hello' }]
    )

    expect(capturedBodies[0]?.stream).toBe(true)
    expect(content).toBe('Hello world')
  })
})
