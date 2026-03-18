// extension/background.js

import {
  CONTEXT_MENU_IDS,
  getPendingPanelLaunchPayload,
  prepareSidePanelForTab,
  launchSidePanelFromContextMenu,
} from './lib/background-sidepanel.js'

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.error('[QuickSummarize] setPanelBehavior failed:', error)
    })
}

function createContextMenus() {
  if (!chrome.contextMenus?.create) return

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.summarizePage,
      title: 'Summarize this page',
      contexts: ['page'],
    })
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.chatPage,
      title: 'Chat with this page',
      contexts: ['page'],
    })
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.summarizeSelection,
      title: 'Summarize selection',
      contexts: ['selection'],
    })
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.chatSelection,
      title: 'Chat with selection',
      contexts: ['selection'],
    })
  })
}

async function openSidePanelForMenuClick(menuItemId, tab) {
  if (!tab?.id) return

  await launchSidePanelFromContextMenu({
    sidePanelApi: chrome.sidePanel,
    menuItemId,
    tabId: tab.id,
    persistLaunch: async (payload) => {
      await chrome.storage.local.set({ pendingPanelLaunch: payload })
    },
    notifyLaunch: async (payload) => {
      try {
        await chrome.runtime.sendMessage({ type: 'PANEL_LAUNCH_ACTION', data: payload })
      } catch {
        // side panel may not be ready yet; storage fallback still exists
      }
    },
  })
}

if (chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    createContextMenus()
  })
}

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    createContextMenus()
  })
}

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!Object.values(CONTEXT_MENU_IDS).includes(info.menuItemId)) return
    openSidePanelForMenuClick(info.menuItemId, tab).catch((error) => {
      console.error('[QuickSummarize] context menu side panel open failed:', error)
    })
  })
}

function formatLogValue(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

let timedtextBlockWarned = false

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROXY_FETCH') {
    const { url, options } = message.data

    if (typeof url === 'string' && url.includes('youtube.com/api/timedtext')) {
      if (!timedtextBlockWarned) {
        timedtextBlockWarned = true
        console.warn('[QuickSummarize] PROXY_FETCH blocked for timedtext URL')
      }
      sendResponse({ success: false, error: 'TIMEDTEXT_PROXY_DISABLED' })
      return true
    }

    const fetchOptions = {
      method: options?.method || 'GET',
      headers: {
        Accept: '*/*',
        ...(options?.headers || {}),
      },
      body: options?.body,
      credentials: options?.credentials || 'include',
      cache: options?.cache || 'no-store',
      mode: options?.mode || 'cors',
    }

    fetch(url, fetchOptions)
      .then(async (res) => {
        const text = await res.text()
        if (!res.ok) {
          const payload = {
            url,
            status: res.status,
            contentType: res.headers.get('content-type') || '',
            bodyPreview: text.slice(0, 200),
          }
          console.error(`[QuickSummarize] PROXY_FETCH http error ${formatLogValue(payload)}`)
          sendResponse({
            success: false,
            error: 'HTTP_ERROR',
            status: res.status,
            text: text.slice(0, 2000),
          })
          return
        }

        console.debug('[QuickSummarize] PROXY_FETCH ok', {
          url,
          status: res.status,
          contentType: res.headers.get('content-type') || '',
          bodyPreview: text.slice(0, 120),
        })
        sendResponse({ success: true, text })
      })
      .catch((error) => {
        console.error('[QuickSummarize] PROXY_FETCH failed:', { url, error })
        sendResponse({ success: false, error: error.message || 'FETCH_FAILED' })
      })
      
    return true // 保持异步连接
  }
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'QS_SSE_PROXY') return

  let controller = null
  let started = false
  let disconnected = false

  const safePost = (payload) => {
    if (disconnected) return
    try {
      port.postMessage(payload)
    } catch {
      // ignore post failures on disconnected port
    }
  }

  const cleanup = () => {
    controller?.abort()
    controller = null
    disconnected = true
  }

  port.onDisconnect.addListener(() => {
    cleanup()
  })

  port.onMessage.addListener((message) => {
    if (!message || disconnected) return

    if (message.type === 'ABORT') {
      controller?.abort()
      return
    }

    if (message.type !== 'START' || started) return
    started = true

    const { url, options } = message.data || {}
    controller = new AbortController()

    const fetchOptions = {
      method: options?.method || 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...(options?.headers || {}),
      },
      body: options?.body,
      credentials: options?.credentials || 'include',
      cache: options?.cache || 'no-store',
      mode: options?.mode || 'cors',
      signal: controller.signal,
    }

    ;(async () => {
      try {
        const res = await fetch(url, fetchOptions)

        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          safePost({
            type: 'ERROR',
            error: 'HTTP_ERROR',
            status: res.status,
            detail: detail.slice(0, 2000),
          })
          return
        }

        if (!res.body) {
          const text = await res.text().catch(() => '')
          if (text) {
            safePost({ type: 'CHUNK', chunk: text })
          }
          safePost({ type: 'END' })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (!disconnected) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (chunk) {
            safePost({ type: 'CHUNK', chunk })
          }
        }

        const trailing = decoder.decode()
        if (trailing) {
          safePost({ type: 'CHUNK', chunk: trailing })
        }

        safePost({ type: 'END' })
      } catch (error) {
        if (controller?.signal?.aborted || disconnected) {
          return
        }
        safePost({
          type: 'ERROR',
          error: error?.message || 'STREAM_FETCH_FAILED',
        })
      } finally {
        controller = null
      }
    })()
  })
})
