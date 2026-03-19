export function sendRuntimeMessageSafely(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError
      resolve(response)
    })
  })
}
