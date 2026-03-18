import { completeChat, streamChatReply } from './llm.js'
import { buildChatMessages, selectTranscriptContext } from './chat-context.js'

function clampCount(value, fallback, max) {
  const count = Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : fallback
  return Math.min(max, count)
}

function toCitation(chunk) {
  return {
    label: String(chunk?.id || 'chunk'),
    startSec: Number.isFinite(Number(chunk?.startSec)) ? Math.max(0, Number(chunk.startSec)) : 0,
  }
}

function truncateText(text, maxChars = 1600) {
  const limit = Number.isFinite(Number(maxChars)) ? Math.max(80, Number(maxChars)) : 1600
  const value = String(text || '').trim()
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}...`
}

function normalizeToolResult(content, citations = []) {
  return {
    content: String(content || '').trim(),
    citations: Array.isArray(citations) ? citations : [],
  }
}

function hasUsefulTranscriptEvidence(observations = []) {
  return observations.some((item) => Array.isArray(item?.citations) && item.citations.length > 0)
}

async function ensureTranscriptEvidence(session, question, tools, observations, toolCalls) {
  if (hasUsefulTranscriptEvidence(observations)) return

  if (Array.isArray(session?.transcriptChunks) && session.transcriptChunks.length > 0) {
    const searched = await tools.search_transcript({ query: question, maxResults: 3 })
    observations.push({ tool: 'search_transcript', ...normalizeToolResult(searched?.content, searched?.citations) })
    toolCalls.push('search_transcript')
    if (hasUsefulTranscriptEvidence(observations)) return

    const opening = await tools.read_opening_chunks({ count: 2 })
    observations.push({ tool: 'read_opening_chunks', ...normalizeToolResult(opening?.content, opening?.citations) })
    toolCalls.push('read_opening_chunks')
    if (hasUsefulTranscriptEvidence(observations)) return
  }

  if (String(session?.transcriptText || '').trim()) {
    const transcript = await tools.read_full_transcript({ maxChars: 3200 })
    observations.push({ tool: 'read_full_transcript', ...normalizeToolResult(transcript?.content, transcript?.citations) })
    toolCalls.push('read_full_transcript')
  }
}

export function createVideoChatAgentTools(session = {}) {
  const transcriptChunks = Array.isArray(session?.transcriptChunks) ? session.transcriptChunks : []
  const transcriptText = String(session?.transcriptText || '')
  const summaryDigest = String(session?.summaryDigest || '')

  return {
    async search_transcript({ query = '', maxResults = 3 } = {}) {
      const queryText = String(query || '').trim()
      let chunks = []

      if (queryText) {
        chunks = transcriptChunks
          .map((chunk) => ({
            chunk,
            score: String(chunk?.text || '').includes(queryText) ? 4 : 0,
          }))
          .filter((item) => item.score > 0)
          .map((item) => item.chunk)
      }

      if (chunks.length === 0) {
        const selected = selectTranscriptContext({
          question: query,
          transcriptChunks,
          maxChunks: clampCount(maxResults, 3, 6),
        })
        chunks = selected.chunks
      }

      return normalizeToolResult(
        chunks
          .map((chunk) => `[${chunk.id} @ ${chunk.startSec}s] ${chunk.text}`)
          .join('\n\n'),
        chunks.map(toCitation)
      )
    },

    async read_transcript_chunk({ chunkId = '' } = {}) {
      const chunk = transcriptChunks.find((item) => item?.id === chunkId)
      if (!chunk) return normalizeToolResult('No transcript chunk found for that id.', [])
      return normalizeToolResult(`[${chunk.id} @ ${chunk.startSec}s] ${chunk.text}`, [toCitation(chunk)])
    },

    async read_opening_chunks({ count = 2 } = {}) {
      const chunks = transcriptChunks.slice(0, clampCount(count, 2, 4))
      return normalizeToolResult(
        chunks.map((chunk) => `[${chunk.id} @ ${chunk.startSec}s] ${chunk.text}`).join('\n\n'),
        chunks.map(toCitation)
      )
    },

    async read_ending_chunks({ count = 2 } = {}) {
      const chunks = transcriptChunks.slice(Math.max(0, transcriptChunks.length - clampCount(count, 2, 4)))
      return normalizeToolResult(
        chunks.map((chunk) => `[${chunk.id} @ ${chunk.startSec}s] ${chunk.text}`).join('\n\n'),
        chunks.map(toCitation)
      )
    },

    async read_summary_digest() {
      return normalizeToolResult(summaryDigest || 'No summary digest is available yet.', [])
    },

    async read_full_transcript({ maxChars = 3200 } = {}) {
      return normalizeToolResult(truncateText(transcriptText, maxChars), [])
    },
  }
}

function buildToolCatalog() {
  return [
    'search_transcript(query, maxResults): search the transcript for relevant chunks',
    'read_transcript_chunk(chunkId): read one transcript chunk by id',
    'read_opening_chunks(count): read the beginning of the transcript',
    'read_ending_chunks(count): read the end of the transcript',
    'read_summary_digest(): read the existing summary digest if available',
    'read_full_transcript(maxChars): read a truncated raw transcript fallback',
  ].join('\n')
}

function parsePlannerDecision(raw) {
  let parsed
  try {
    parsed = JSON.parse(String(raw || '').trim())
  } catch {
    return { type: 'final' }
  }

  if (parsed?.type === 'tool_call' && typeof parsed?.tool === 'string') {
    return {
      type: 'tool_call',
      tool: parsed.tool,
      args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {},
    }
  }

  return { type: 'final' }
}

export async function defaultPlanVideoChatTurn({ config, session, question, observations = [], signal, completeFn = completeChat }) {
  const language = session?.language === 'zh' ? 'zh' : 'en'
  const plannerPrompt = language === 'zh'
    ? [
        '你是一个视频字幕对话智能体。先决定是否调用工具，再回答。',
        'Treat the transcript as the primary source of truth.',
        'Do not rely on summary digest first when transcript tools can answer the question.',
        '优先把字幕当作唯一事实源；如果字幕工具足够回答，就不要先依赖摘要。',
        '如果还缺证据，只输出 JSON：{"type":"tool_call","tool":"工具名","args":{}}',
        '如果已经有足够证据，只输出 JSON：{"type":"final"}',
        '禁止输出任何额外文字。',
        '可用工具：',
        buildToolCatalog(),
      ].join('\n')
    : [
        'You are a transcript chat agent. Decide whether to call a tool before answering.',
        'Treat the transcript as the primary source of truth.',
        'Do not rely on summary digest first when transcript tools can answer the question.',
        'If more evidence is needed, output JSON only: {"type":"tool_call","tool":"tool_name","args":{}}',
        'If enough evidence is already available, output JSON only: {"type":"final"}',
        'Do not output any extra prose.',
        'Available tools:',
        buildToolCatalog(),
      ].join('\n')

  const plannerMessages = buildChatMessages({
    language,
    question,
    summaryDigest: session?.summaryDigest || '',
    memorySummary: session?.memorySummary || '',
    recentTurns: Array.isArray(session?.turns) ? session.turns.slice(-4) : [],
  })
  plannerMessages[0] = { role: 'system', content: plannerPrompt }

  if (observations.length > 0) {
    plannerMessages.splice(plannerMessages.length - 1, 0, {
      role: 'system',
      content: `Tool observations:\n${observations.map((item, index) => `${index + 1}. ${item.tool}: ${item.content}`).join('\n\n')}`,
    })
  }

  const raw = await completeFn(config, plannerMessages, signal)
  return parsePlannerDecision(raw)
}

export async function defaultAnswerVideoChatTurn({ config, session, question, observations = [], onChunk, signal }) {
  const citations = observations.flatMap((item) => item.citations || [])
  const messages = buildChatMessages({
    language: session?.language || 'en',
    question,
    summaryDigest: session?.summaryDigest || '',
    memorySummary: session?.memorySummary || '',
    recentTurns: Array.isArray(session?.turns) ? session.turns.slice(-6) : [],
  })

  if (observations.length > 0) {
    messages.splice(messages.length - 1, 0, {
      role: 'system',
      content: `Tool evidence:\n${observations.map((item) => `${item.tool}: ${item.content}`).join('\n\n')}`,
    })
  }

  let answer = ''
  await streamChatReply(config, messages, (chunk) => {
    answer += String(chunk || '')
    if (typeof onChunk === 'function') onChunk(chunk)
  }, signal)

  return { answer, citations }
}

export async function runVideoChatAgentTurn({
  config = null,
  session,
  question,
  planFn,
  answerFn,
  signal,
  maxSteps = 4,
  onChunk,
} = {}) {
  const tools = createVideoChatAgentTools(session)
  const toolNames = Object.keys(tools)
  const observations = []
  const toolCalls = []
  const planner = typeof planFn === 'function'
    ? planFn
    : (input) => defaultPlanVideoChatTurn({ ...input, config })
  const answerer = typeof answerFn === 'function'
    ? answerFn
    : (input) => defaultAnswerVideoChatTurn({ ...input, config, onChunk })

  for (let step = 0; step < maxSteps; step += 1) {
    const decision = await planner({ session, question, observations, tools: toolNames, signal })
    if (!decision || decision.type !== 'tool_call') {
      break
    }

    const tool = tools[decision.tool]
    if (typeof tool !== 'function') {
      observations.push({ tool: decision.tool, content: 'Tool unavailable.', citations: [] })
      continue
    }

    const result = await tool(decision.args || {})
    toolCalls.push(decision.tool)
    observations.push({ tool: decision.tool, ...normalizeToolResult(result?.content, result?.citations) })
  }

  await ensureTranscriptEvidence(session, question, tools, observations, toolCalls)

  const finalResult = await answerer({ session, question, observations, signal })
  return {
    answer: String(finalResult?.answer || '').trim(),
    citations: Array.isArray(finalResult?.citations) ? finalResult.citations : [],
    observations,
    toolCalls,
  }
}
