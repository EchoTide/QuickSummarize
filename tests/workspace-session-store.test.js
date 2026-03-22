import { describe, it, expect } from 'vitest'

import {
  loadWorkspaceSessionSnapshot,
  saveWorkspaceSessionSnapshot,
  clearWorkspaceSessionTab,
  clearWorkspaceSessionStore,
} from '../extension/lib/workspace-session-store.js'

function createFakeStorageArea(initial = {}) {
  const state = { ...initial }
  return {
    async get(keys) {
      if (keys == null) return { ...state }
      if (Array.isArray(keys)) {
        return keys.reduce((result, key) => {
          result[key] = state[key]
          return result
        }, {})
      }
      if (typeof keys === 'string') {
        return { [keys]: state[keys] }
      }
      return Object.keys(keys).reduce((result, key) => {
        result[key] = key in state ? state[key] : keys[key]
        return result
      }, {})
    },
    async set(items) {
      Object.assign(state, items)
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete state[key]
      }
    },
    dump() {
      return structuredClone(state)
    },
  }
}

describe('workspace session store', () => {
  it('saves and loads a snapshot by tab and source', async () => {
    const storageArea = createFakeStorageArea()

    await saveWorkspaceSessionSnapshot({
      storageArea,
      tabId: 5,
      sourceKey: 'webpage:https://example.com/a',
      snapshot: { summaryText: 'hello' },
      maxEntries: 5,
    })

    await expect(
      loadWorkspaceSessionSnapshot({
        storageArea,
        tabId: 5,
        sourceKey: 'webpage:https://example.com/a',
      })
    ).resolves.toEqual({ summaryText: 'hello' })
  })

  it('keeps same-page snapshots isolated across tabs', async () => {
    const storageArea = createFakeStorageArea()

    await saveWorkspaceSessionSnapshot({
      storageArea,
      tabId: 5,
      sourceKey: 'webpage:https://example.com/a',
      snapshot: { summaryText: 'tab-5' },
    })
    await saveWorkspaceSessionSnapshot({
      storageArea,
      tabId: 6,
      sourceKey: 'webpage:https://example.com/a',
      snapshot: { summaryText: 'tab-6' },
    })

    await expect(
      loadWorkspaceSessionSnapshot({
        storageArea,
        tabId: 5,
        sourceKey: 'webpage:https://example.com/a',
      })
    ).resolves.toEqual({ summaryText: 'tab-5' })
    await expect(
      loadWorkspaceSessionSnapshot({
        storageArea,
        tabId: 6,
        sourceKey: 'webpage:https://example.com/a',
      })
    ).resolves.toEqual({ summaryText: 'tab-6' })
  })

  it('removes snapshots for a closed tab only', async () => {
    const storageArea = createFakeStorageArea()

    await saveWorkspaceSessionSnapshot({
      storageArea,
      tabId: 5,
      sourceKey: 'webpage:https://example.com/a',
      snapshot: { summaryText: 'a' },
    })
    await saveWorkspaceSessionSnapshot({
      storageArea,
      tabId: 6,
      sourceKey: 'webpage:https://example.com/b',
      snapshot: { summaryText: 'b' },
    })

    await clearWorkspaceSessionTab({ storageArea, tabId: 5 })

    await expect(
      loadWorkspaceSessionSnapshot({
        storageArea,
        tabId: 5,
        sourceKey: 'webpage:https://example.com/a',
      })
    ).resolves.toBeNull()
    await expect(
      loadWorkspaceSessionSnapshot({
        storageArea,
        tabId: 6,
        sourceKey: 'webpage:https://example.com/b',
      })
    ).resolves.toEqual({ summaryText: 'b' })
  })

  it('prunes oldest entries when capacity is exceeded', async () => {
    const storageArea = createFakeStorageArea()

    await saveWorkspaceSessionSnapshot({ storageArea, tabId: 1, sourceKey: 'page:a', snapshot: { id: 'a' }, maxEntries: 2 })
    await saveWorkspaceSessionSnapshot({ storageArea, tabId: 2, sourceKey: 'page:b', snapshot: { id: 'b' }, maxEntries: 2 })
    await saveWorkspaceSessionSnapshot({ storageArea, tabId: 3, sourceKey: 'page:c', snapshot: { id: 'c' }, maxEntries: 2 })

    await expect(loadWorkspaceSessionSnapshot({ storageArea, tabId: 1, sourceKey: 'page:a' })).resolves.toBeNull()
    await expect(loadWorkspaceSessionSnapshot({ storageArea, tabId: 2, sourceKey: 'page:b' })).resolves.toEqual({ id: 'b' })
    await expect(loadWorkspaceSessionSnapshot({ storageArea, tabId: 3, sourceKey: 'page:c' })).resolves.toEqual({ id: 'c' })
  })

  it('clears the whole store', async () => {
    const storageArea = createFakeStorageArea()

    await saveWorkspaceSessionSnapshot({
      storageArea,
      tabId: 5,
      sourceKey: 'webpage:https://example.com/a',
      snapshot: { summaryText: 'hello' },
    })

    await clearWorkspaceSessionStore({ storageArea })

    expect(storageArea.dump()).toEqual({})
  })
})
