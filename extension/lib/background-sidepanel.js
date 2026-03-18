export const CONTEXT_MENU_IDS = {
  summarizePage: 'qs-summarize-page',
  chatPage: 'qs-chat-page',
  summarizeSelection: 'qs-summarize-selection',
  chatSelection: 'qs-chat-selection',
}

export function getPendingPanelLaunchPayload(menuItemId, tabId) {
  const mode = menuItemId === CONTEXT_MENU_IDS.chatPage || menuItemId === CONTEXT_MENU_IDS.chatSelection
    ? 'chat'
    : 'summary'
  const scope = menuItemId === CONTEXT_MENU_IDS.chatSelection || menuItemId === CONTEXT_MENU_IDS.summarizeSelection
    ? 'selection'
    : 'page'

  return {
    mode,
    scope,
    tabId,
    ts: Date.now(),
  }
}

export async function prepareSidePanelForTab({ sidePanelApi, tabId, path = 'sidepanel.html' } = {}) {
  if (!sidePanelApi?.open || !tabId) return

  await sidePanelApi.open({ tabId })

  if (typeof sidePanelApi.setOptions === 'function') {
    await sidePanelApi.setOptions({
      tabId,
      path,
      enabled: true,
    })
  }
}

export async function launchSidePanelFromContextMenu({
  sidePanelApi,
  menuItemId,
  tabId,
  persistLaunch,
  notifyLaunch,
} = {}) {
  if (!tabId) return

  await prepareSidePanelForTab({ sidePanelApi, tabId })

  const payload = getPendingPanelLaunchPayload(menuItemId, tabId)
  if (typeof persistLaunch === 'function') {
    await persistLaunch(payload)
  }
  if (typeof notifyLaunch === 'function') {
    await notifyLaunch(payload)
  }
}
