export const SYSTEM_PROMPT_EN = `You are a video summarization assistant. Summarize the transcript into a structured English summary.
Requirements:
1. Start with one sentence that captures the video's main topic
2. Then list the key points in concise bullets
3. Keep the wording clear and brief`

export const SYSTEM_PROMPT_ZH = `你是一个视频内容总结助手。请将以下视频字幕内容总结为结构化的中文摘要。
要求：
1. 先用一句话概括视频主题
2. 然后分要点列出核心内容
3. 语言简洁，不要废话`

export function buildRequestBody(model, transcript, language = 'en') {
  const systemPrompt = language === 'zh' ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN
  return {
    model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcript },
    ],
  }
}

function stripThinkTags(content) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '')
}

const CJK_REGEX = /[\u3400-\u9fff]/
const REASONING_LINE_REGEX =
  /^(wants me to summarize|let me|the video is about|one sentence summary|core points|let's|i should|i will|analysis:|final answer:)/i

function stripEnglishReasoningLines(text) {
  if (!text) return ''

  const lines = String(text).split('\n')
  const kept = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return true
    if (CJK_REGEX.test(trimmed)) return true
    return !REASONING_LINE_REGEX.test(trimmed)
  })

  return kept.join('\n')
}

function createSummaryOutputSanitizer(language = 'en') {
  if (language !== 'zh') {
    return {
      consume(chunk) {
        return stripThinkTags(String(chunk || ''))
      },
      flush() {
        return ''
      },
    }
  }

  const state = {
    started: false,
    pending: '',
  }

  const consume = (chunk) => {
    const cleaned = stripEnglishReasoningLines(stripThinkTags(String(chunk || '')))
    if (!cleaned) return ''

    if (state.started) {
      return cleaned
    }

    state.pending += cleaned
    if (!CJK_REGEX.test(state.pending)) {
      return ''
    }

    const firstCjkIndex = state.pending.search(CJK_REGEX)
    const lineStart = state.pending.lastIndexOf('\n', firstCjkIndex)
    const candidateStart = lineStart === -1 ? 0 : lineStart + 1
    const prefix = state.pending.slice(candidateStart, firstCjkIndex)
    const preservePrefix = /^[\s#>*\-0-9.)[(]+$/.test(prefix)
    const startIndex = preservePrefix ? candidateStart : firstCjkIndex
    const output = state.pending.slice(startIndex)

    state.pending = ''
    state.started = true
    return output
  }

  const flush = () => {
    if (state.started) return ''
    const output = state.pending.trim()
    state.pending = ''
    return output
  }

  return { consume, flush }
}

export function parseSSELine(line) {
  if (!line || line.startsWith(':')) return null
  if (!line.startsWith('data: ')) return null

  const data = line.slice(6)
  if (data === '[DONE]') return null

  try {
    const parsed = JSON.parse(data)
    const content = parsed.choices?.[0]?.delta?.content ?? ''
    return stripThinkTags(content)
  } catch {
    return null
  }
}

function hasRuntimeProxy() {
  return (
    typeof chrome !== 'undefined' &&
    chrome?.runtime &&
    typeof chrome.runtime.sendMessage === 'function'
  )
}

function hasRuntimeStreamProxy() {
  return hasRuntimeProxy() && typeof chrome.runtime.connect === 'function'
}

function createAbortError() {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

function formatErrorDetail(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (value instanceof Error) return value.message || String(value)

  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message) {
      return value.message
    }

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function proxyFetchText(url, options = {}, signal) {
  return new Promise((resolve, reject) => {
    if (!hasRuntimeProxy()) {
      reject(new Error('Runtime proxy unavailable'))
      return
    }

    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const onAbort = () => {
      reject(createAbortError())
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })

    chrome.runtime.sendMessage(
      {
        type: 'PROXY_FETCH',
        data: { url, options },
      },
      (response) => {
        signal?.removeEventListener?.('abort', onAbort)

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        if (!response?.success) {
          const status = response?.status ? ` (${response.status})` : ''
          const baseError = formatErrorDetail(response?.error) || 'Proxy fetch failed'
          const detailText = formatErrorDetail(response?.text)
          const detail = detailText ? `: ${detailText}` : ''
          reject(new Error(`${baseError}${status}${detail}`))
          return
        }

        resolve(response.text || '')
      }
    )
  })
}

function emitSSEText(sseText, onChunk, language = 'en') {
  const sanitizer = createSummaryOutputSanitizer(language)
  const lines = String(sseText || '').replace(/\r/g, '').split('\n')
  for (const line of lines) {
    const content = parseSSELine(line.trim())
    if (content === null || content === '') continue

    const sanitized = sanitizer.consume(content)
    if (sanitized) {
      onChunk(sanitized)
    }
  }

  const flushed = sanitizer.flush()
  if (flushed) {
    onChunk(flushed)
  }
}

function emitSSETextRaw(sseText, onChunk) {
  const lines = String(sseText || '').replace(/\r/g, '').split('\n')
  for (const line of lines) {
    const content = parseSSELine(line.trim())
    if (content === null || content === '') continue
    onChunk(content)
  }
}

function streamSSEViaRuntimePortRaw(url, options, onChunk, signal) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'QS_SSE_PROXY' })
    let settled = false
    let buffer = ''

    const cleanup = () => {
      signal?.removeEventListener?.('abort', onAbort)
      port.onMessage.removeListener(onMessage)
      port.onDisconnect.removeListener(onDisconnect)
    }

    const settle = (fn, value) => {
      if (settled) return
      settled = true
      cleanup()
      fn(value)
    }

    const consumeChunk = (chunk) => {
      buffer += String(chunk || '').replace(/\r/g, '')
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const content = parseSSELine(rawLine.trim())
        if (content === null || content === '') continue
        onChunk(content)
      }
    }

    const onMessage = (message) => {
      if (!message || settled) return

      if (message.type === 'CHUNK') {
        consumeChunk(message.chunk || '')
        return
      }

      if (message.type === 'END') {
        consumeChunk('\n')
        settle(resolve)
        return
      }

      if (message.type === 'ERROR') {
        const status = message?.status ? ` (${message.status})` : ''
        const detail = message?.detail ? `: ${message.detail}` : ''
        settle(reject, new Error(`${message.error || 'Stream proxy failed'}${status}${detail}`))
      }
    }

    const onDisconnect = () => {
      if (settled) return
      const runtimeError = chrome.runtime.lastError?.message
      settle(reject, new Error(runtimeError || 'Stream proxy disconnected'))
    }

    const onAbort = () => {
      try {
        port.postMessage({ type: 'ABORT' })
      } catch {
        // ignore abort dispatch errors
      }
      settle(reject, createAbortError())
    }

    if (signal?.aborted) {
      onAbort()
      return
    }

    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    signal?.addEventListener?.('abort', onAbort, { once: true })

    port.postMessage({
      type: 'START',
      data: { url, options },
    })
  })
}

function streamSSEViaRuntimePort(url, options, onChunk, signal, language = 'en') {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'QS_SSE_PROXY' })
    let settled = false
    let buffer = ''
    const sanitizer = createSummaryOutputSanitizer(language)

    const cleanup = () => {
      signal?.removeEventListener?.('abort', onAbort)
      port.onMessage.removeListener(onMessage)
      port.onDisconnect.removeListener(onDisconnect)
    }

    const settle = (fn, value) => {
      if (settled) return
      settled = true
      cleanup()
      fn(value)
    }

    const consumeChunk = (chunk) => {
      buffer += String(chunk || '').replace(/\r/g, '')
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const content = parseSSELine(rawLine.trim())
        if (content === null || content === '') continue

        const sanitized = sanitizer.consume(content)
        if (sanitized) {
          onChunk(sanitized)
        }
      }
    }

    const onMessage = (message) => {
      if (!message || settled) return

      if (message.type === 'CHUNK') {
        consumeChunk(message.chunk || '')
        return
      }

      if (message.type === 'END') {
        consumeChunk('\n')
        const flushed = sanitizer.flush()
        if (flushed) {
          onChunk(flushed)
        }
        settle(resolve)
        return
      }

      if (message.type === 'ERROR') {
        const status = message?.status ? ` (${message.status})` : ''
        const detail = message?.detail ? `: ${message.detail}` : ''
        settle(reject, new Error(`${message.error || 'Stream proxy failed'}${status}${detail}`))
      }
    }

    const onDisconnect = () => {
      if (settled) return
      const runtimeError = chrome.runtime.lastError?.message
      settle(reject, new Error(runtimeError || 'Stream proxy disconnected'))
    }

    const onAbort = () => {
      try {
        port.postMessage({ type: 'ABORT' })
      } catch {
        // ignore abort dispatch errors
      }
      settle(reject, createAbortError())
    }

    if (signal?.aborted) {
      onAbort()
      return
    }

    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    signal?.addEventListener?.('abort', onAbort, { once: true })

    port.postMessage({
      type: 'START',
      data: { url, options },
    })
  })
}

export async function streamSummarize({ baseUrl, model, apiKey, language = 'en' }, transcript, onChunk, signal) {
  const url = `${baseUrl}/chat/completions`
  const body = buildRequestBody(model, transcript, language)

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    credentials: 'omit',
  }

  if (hasRuntimeStreamProxy()) {
    await streamSSEViaRuntimePort(url, requestOptions, onChunk, signal, language)
    return
  }

  if (hasRuntimeProxy()) {
    const text = await proxyFetchText(
      url,
      requestOptions,
      signal
    )
    emitSSEText(text, onChunk, language)
    return
  }

  const response = await fetch(url, {
    ...requestOptions,
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`API request failed (${response.status}): ${errorText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const sanitizer = createSummaryOutputSanitizer(language)

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const content = parseSSELine(line.trim())
      if (content === null || content === '') continue

      const sanitized = sanitizer.consume(content)
      if (sanitized) {
        onChunk(sanitized)
      }
    }
  }

  const flushed = sanitizer.flush()
  if (flushed) {
    onChunk(flushed)
  }
}

function parseChatCompletionResponse(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || '').trim())
  } catch {
    throw new Error('Invalid completion response')
  }

  const content = parsed?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('Missing completion content')
  }

  return stripThinkTags(content)
}

export async function completeChat({ baseUrl, model, apiKey }, messages, signal) {
  const url = `${baseUrl}/chat/completions`
  const body = {
    model,
    stream: false,
    messages,
  }

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    credentials: 'omit',
  }

  if (hasRuntimeProxy()) {
    const text = await proxyFetchText(url, requestOptions, signal)
    return parseChatCompletionResponse(text)
  }

  const response = await fetch(url, {
    ...requestOptions,
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`API request failed (${response.status}): ${errorText}`)
  }

  const text = await response.text()
  return parseChatCompletionResponse(text)
}

export async function completeChatStream({ baseUrl, model, apiKey }, messages, signal) {
  const url = `${baseUrl}/chat/completions`
  const body = {
    model,
    stream: true,
    messages,
  }

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    credentials: 'omit',
  }

  let output = ''
  const collect = (chunk) => {
    output += String(chunk || '')
  }

  if (hasRuntimeStreamProxy()) {
    await streamSSEViaRuntimePortRaw(url, requestOptions, collect, signal)
    return output
  }

  if (hasRuntimeProxy()) {
    const text = await proxyFetchText(url, requestOptions, signal)
    emitSSETextRaw(text, collect)
    return output
  }

  const response = await fetch(url, {
    ...requestOptions,
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`API request failed (${response.status}): ${errorText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const content = parseSSELine(line.trim())
      if (content === null || content === '') continue
      collect(content)
    }
  }

  return output
}
