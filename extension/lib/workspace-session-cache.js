function normalizeTabId(tabId) {
  const next = Number(tabId)
  return Number.isInteger(next) && next > 0 ? next : 0
}

function normalizeSourceKey(sourceKey) {
  return String(sourceKey || '').trim()
}

function cloneSnapshot(snapshot) {
  if (snapshot == null) return null
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot)
  }
  return JSON.parse(JSON.stringify(snapshot))
}

export function createWorkspaceCacheKey({ tabId = 0, sourceKey = '' } = {}) {
  const normalizedTabId = normalizeTabId(tabId)
  const normalizedSourceKey = normalizeSourceKey(sourceKey)
  if (!normalizedTabId || !normalizedSourceKey) return ''
  return `${normalizedTabId}::${normalizedSourceKey}`
}

export function createWorkspaceSessionCache({ maxEntries = 20 } = {}) {
  const limit = Math.max(1, Number(maxEntries) || 20)
  const entries = new Map()

  function pruneOverflow() {
    while (entries.size > limit) {
      const oldestKey = entries.keys().next().value
      if (!oldestKey) break
      entries.delete(oldestKey)
    }
  }

  return {
    get({ tabId = 0, sourceKey = '' } = {}) {
      const cacheKey = createWorkspaceCacheKey({ tabId, sourceKey })
      if (!cacheKey || !entries.has(cacheKey)) return null

      const value = entries.get(cacheKey)
      entries.delete(cacheKey)
      entries.set(cacheKey, value)
      return cloneSnapshot(value.snapshot)
    },

    set({ tabId = 0, sourceKey = '', snapshot = null } = {}) {
      const cacheKey = createWorkspaceCacheKey({ tabId, sourceKey })
      if (!cacheKey || !snapshot || typeof snapshot !== 'object') return false

      entries.delete(cacheKey)
      entries.set(cacheKey, {
        tabId: normalizeTabId(tabId),
        sourceKey: normalizeSourceKey(sourceKey),
        snapshot: cloneSnapshot(snapshot),
      })
      pruneOverflow()
      return true
    },

    clearTab(tabId = 0) {
      const normalizedTabId = normalizeTabId(tabId)
      if (!normalizedTabId) return 0

      let removed = 0
      for (const [cacheKey, entry] of entries.entries()) {
        if (entry.tabId !== normalizedTabId) continue
        entries.delete(cacheKey)
        removed += 1
      }
      return removed
    },

    clear() {
      entries.clear()
    },

    size() {
      return entries.size
    },
  }
}
