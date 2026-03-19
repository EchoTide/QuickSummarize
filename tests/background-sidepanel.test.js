import { describe, it, expect, vi } from 'vitest'

import {
  CONTEXT_MENU_IDS,
  prepareSidePanelForTab,
  getPendingPanelLaunchPayload,
  launchSidePanelFromContextMenu,
} from '../extension/lib/background-sidepanel.js'

describe('prepareSidePanelForTab', () => {
  it('opens immediately and configures side panel without blocking the gesture path', async () => {
    const calls = []
    const setOptions = vi.fn(async () => {
      calls.push('setOptions')
    })
    const open = vi.fn(async () => {
      calls.push('open')
    })

    await prepareSidePanelForTab({
      sidePanelApi: { setOptions, open },
      tabId: 42,
    })

    expect(calls[0]).toBe('open')
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'sidepanel.html',
      enabled: true,
    })
    expect(open).toHaveBeenCalledWith({ tabId: 42 })
  })
})

describe('getPendingPanelLaunchPayload', () => {
  it('maps summarize page clicks to a summary page launch', () => {
    expect(getPendingPanelLaunchPayload(CONTEXT_MENU_IDS.summarizePage, 8)).toEqual(
      expect.objectContaining({
        mode: 'summary',
        scope: 'page',
        tabId: 8,
      })
    )
  })

  it('maps chat selection clicks to a chat selection launch', () => {
    expect(getPendingPanelLaunchPayload(CONTEXT_MENU_IDS.chatSelection, 9)).toEqual(
      expect.objectContaining({
        mode: 'chat',
        scope: 'selection',
        tabId: 9,
      })
    )
  })

})

describe('launchSidePanelFromContextMenu', () => {
  it('opens the side panel before awaiting async payload delivery', async () => {
    const calls = []
    const sidePanelApi = {
      setOptions: vi.fn(() => {
        calls.push('setOptions')
        return Promise.resolve()
      }),
      open: vi.fn(() => {
        calls.push('open')
        return Promise.resolve()
      }),
    }
    const persistLaunch = vi.fn(async () => {
      calls.push('persist')
    })
    const notifyLaunch = vi.fn(async () => {
      calls.push('notify')
    })

    await launchSidePanelFromContextMenu({
      sidePanelApi,
      menuItemId: CONTEXT_MENU_IDS.summarizePage,
      tabId: 12,
      persistLaunch,
      notifyLaunch,
    })

    expect(calls.indexOf('open')).toBeGreaterThan(-1)
    expect(calls.indexOf('persist')).toBeGreaterThan(-1)
    expect(calls.indexOf('open')).toBeLessThan(calls.indexOf('persist'))
    expect(calls.indexOf('open')).toBeLessThan(calls.indexOf('notify'))
  })
})
