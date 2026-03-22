import { createWorkspaceCacheKey } from './workspace-session-cache.js'

const STORAGE_KEY = 'workspaceSessions'

function cloneValue(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

async function readStore(storageArea) {
  if (!storageArea?.get) return {}
  const result = await storageArea.get([STORAGE_KEY])
  const store = result?.[STORAGE_KEY]
  return store && typeof store === 'object' ? store : {}
}

async function writeStore(storageArea, store) {
  if (!storageArea?.set) return false
  if (!store || Object.keys(store).length === 0) {
    if (storageArea.remove) {
      await storageArea.remove([STORAGE_KEY])
      return true
    }
    await storageArea.set({ [STORAGE_KEY]: {} })
    return true
  }

  await storageArea.set({ [STORAGE_KEY]: store })
  return true
}

function getDefaultStorageArea(storageArea) {
  return storageArea || chrome?.storage?.session || null
}

export async function loadWorkspaceSessionSnapshot({ storageArea, tabId = 0, sourceKey = '' } = {}) {
  const area = getDefaultStorageArea(storageArea)
  const cacheKey = createWorkspaceCacheKey({ tabId, sourceKey })
  if (!area || !cacheKey) return null

  const store = await readStore(area)
  const entry = store[cacheKey]
  return entry?.snapshot ? cloneValue(entry.snapshot) : null
}

export async function saveWorkspaceSessionSnapshot({
  storageArea,
  tabId = 0,
  sourceKey = '',
  snapshot = null,
  maxEntries = 20,
} = {}) {
  const area = getDefaultStorageArea(storageArea)
  const cacheKey = createWorkspaceCacheKey({ tabId, sourceKey })
  if (!area || !cacheKey || !snapshot || typeof snapshot !== 'object') return false

  const store = await readStore(area)
  store[cacheKey] = {
    tabId: Number(tabId) || 0,
    sourceKey: String(sourceKey || ''),
    updatedAt: Date.now(),
    snapshot: cloneValue(snapshot),
  }

  const limit = Math.max(1, Number(maxEntries) || 20)
  const sortedEntries = Object.entries(store).sort(([, left], [, right]) => {
    return Number(left?.updatedAt || 0) - Number(right?.updatedAt || 0)
  })
  while (sortedEntries.length > limit) {
    const [oldestKey] = sortedEntries.shift()
    delete store[oldestKey]
  }

  await writeStore(area, store)
  return true
}

export async function clearWorkspaceSessionTab({ storageArea, tabId = 0 } = {}) {
  const area = getDefaultStorageArea(storageArea)
  const normalizedTabId = Number(tabId) || 0
  if (!area || !normalizedTabId) return 0

  const store = await readStore(area)
  let removed = 0
  for (const [cacheKey, entry] of Object.entries(store)) {
    if (Number(entry?.tabId || 0) !== normalizedTabId) continue
    delete store[cacheKey]
    removed += 1
  }

  await writeStore(area, store)
  return removed
}

export async function clearWorkspaceSessionStore({ storageArea } = {}) {
  const area = getDefaultStorageArea(storageArea)
  if (!area) return false
  if (area.remove) {
    await area.remove([STORAGE_KEY])
    return true
  }
  await area.set({ [STORAGE_KEY]: {} })
  return true
}
