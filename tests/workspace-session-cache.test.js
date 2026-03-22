import { describe, it, expect } from 'vitest'

import {
  createWorkspaceSessionCache,
  createWorkspaceCacheKey,
} from '../extension/lib/workspace-session-cache.js'

describe('createWorkspaceCacheKey', () => {
  it('builds a stable key from tab and source identity', () => {
    expect(createWorkspaceCacheKey({ tabId: 7, sourceKey: 'page:https://example.com/a' })).toBe(
      '7::page:https://example.com/a'
    )
  })

  it('returns an empty key when tab id or source key is missing', () => {
    expect(createWorkspaceCacheKey({ tabId: 0, sourceKey: 'x' })).toBe('')
    expect(createWorkspaceCacheKey({ tabId: 4, sourceKey: '' })).toBe('')
  })
})

describe('workspace session cache', () => {
  it('restores the snapshot for the same tab and page', () => {
    const cache = createWorkspaceSessionCache()
    const snapshot = {
      summaryText: 'Summary A',
      currentWorkspaceTab: 'chat',
      pageChatSession: { turns: [{ role: 'user', content: 'hello' }] },
    }

    cache.set({ tabId: 3, sourceKey: 'page:https://example.com/a', snapshot })

    expect(cache.get({ tabId: 3, sourceKey: 'page:https://example.com/a' })).toEqual(snapshot)
  })

  it('does not restore a snapshot for a different page in the same tab', () => {
    const cache = createWorkspaceSessionCache()

    cache.set({
      tabId: 3,
      sourceKey: 'page:https://example.com/a',
      snapshot: { summaryText: 'Summary A' },
    })

    expect(cache.get({ tabId: 3, sourceKey: 'page:https://example.com/b' })).toBeNull()
  })

  it('keeps snapshots isolated between tabs even for the same page', () => {
    const cache = createWorkspaceSessionCache()

    cache.set({
      tabId: 3,
      sourceKey: 'page:https://example.com/a',
      snapshot: { summaryText: 'Tab 3 summary' },
    })
    cache.set({
      tabId: 4,
      sourceKey: 'page:https://example.com/a',
      snapshot: { summaryText: 'Tab 4 summary' },
    })

    expect(cache.get({ tabId: 3, sourceKey: 'page:https://example.com/a' })).toEqual({
      summaryText: 'Tab 3 summary',
    })
    expect(cache.get({ tabId: 4, sourceKey: 'page:https://example.com/a' })).toEqual({
      summaryText: 'Tab 4 summary',
    })
  })

  it('clears all cached snapshots when a tab closes', () => {
    const cache = createWorkspaceSessionCache()

    cache.set({
      tabId: 3,
      sourceKey: 'page:https://example.com/a',
      snapshot: { summaryText: 'Summary A' },
    })
    cache.set({
      tabId: 3,
      sourceKey: 'page:https://example.com/b',
      snapshot: { summaryText: 'Summary B' },
    })
    cache.set({
      tabId: 4,
      sourceKey: 'page:https://example.com/c',
      snapshot: { summaryText: 'Summary C' },
    })

    cache.clearTab(3)

    expect(cache.get({ tabId: 3, sourceKey: 'page:https://example.com/a' })).toBeNull()
    expect(cache.get({ tabId: 3, sourceKey: 'page:https://example.com/b' })).toBeNull()
    expect(cache.get({ tabId: 4, sourceKey: 'page:https://example.com/c' })).toEqual({
      summaryText: 'Summary C',
    })
  })

  it('prunes the oldest snapshot when the cache reaches capacity', () => {
    const cache = createWorkspaceSessionCache({ maxEntries: 2 })

    cache.set({ tabId: 1, sourceKey: 'page:a', snapshot: { summaryText: 'A' } })
    cache.set({ tabId: 2, sourceKey: 'page:b', snapshot: { summaryText: 'B' } })
    cache.set({ tabId: 3, sourceKey: 'page:c', snapshot: { summaryText: 'C' } })

    expect(cache.get({ tabId: 1, sourceKey: 'page:a' })).toBeNull()
    expect(cache.get({ tabId: 2, sourceKey: 'page:b' })).toEqual({ summaryText: 'B' })
    expect(cache.get({ tabId: 3, sourceKey: 'page:c' })).toEqual({ summaryText: 'C' })
  })
})
