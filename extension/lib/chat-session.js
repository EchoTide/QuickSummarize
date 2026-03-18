function normalizeVideoId(videoId) {
  return String(videoId || '').trim()
}

function normalizeLanguage(language) {
  return String(language || 'en').trim() || 'en'
}

function createSessionKey(videoId, language) {
  return `${normalizeVideoId(videoId)}::${normalizeLanguage(language)}`
}

export function createVideoChatSession({ videoId = '', language = 'en' } = {}) {
  return {
    sessionKey: createSessionKey(videoId, language),
    videoId: normalizeVideoId(videoId),
    language: normalizeLanguage(language),
    transcriptText: '',
    transcriptChunks: [],
    summaryDigest: '',
    memorySummary: '',
    citationMap: {},
    turns: [],
  }
}

export function appendTranscriptSnapshot(session, snapshot = {}) {
  if (!session) return session

  session.transcriptText = String(snapshot.transcriptText || '')
  session.transcriptChunks = Array.isArray(snapshot.transcriptChunks) ? [...snapshot.transcriptChunks] : []
  session.summaryDigest = String(snapshot.summaryDigest || session.summaryDigest || '')
  return session
}

export function addChatTurn(session, turn = {}) {
  if (!session) return session

  const role = turn?.role === 'assistant' ? 'assistant' : 'user'
  const content = String(turn?.content || '').trim()
  if (!content) return session

  session.turns.push({
    role,
    content,
    createdAt: Number.isFinite(Number(turn?.createdAt)) ? Number(turn.createdAt) : Date.now(),
    citations: Array.isArray(turn?.citations) ? [...turn.citations] : [],
  })
  return session
}

export function compactSessionTurns(session, options = {}) {
  if (!session) return session

  const keepLastTurns = Number.isFinite(Number(options.keepLastTurns)) ? Math.max(0, Number(options.keepLastTurns)) : 6
  if (session.turns.length <= keepLastTurns) return session

  const preserved = session.turns.slice(-keepLastTurns)
  const compacted = session.turns.slice(0, Math.max(0, session.turns.length - keepLastTurns))
  const compactedText = compacted
    .map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.content}`)
    .join('\n')
    .trim()

  session.memorySummary = [session.memorySummary, compactedText].filter(Boolean).join('\n').trim()
  session.turns = preserved
  return session
}

export function resetVideoChatSession(_session, { videoId = '', language = 'en' } = {}) {
  return createVideoChatSession({ videoId, language })
}
