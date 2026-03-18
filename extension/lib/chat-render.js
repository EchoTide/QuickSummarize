import { marked } from 'marked'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getChatRoleLabel(role, language = 'en') {
  const isZh = language === 'zh'
  if (role === 'assistant') {
    return isZh ? '助手' : 'Assistant'
  }

  return isZh ? '你' : 'You'
}

export function renderChatContent(role, content) {
  const text = String(content || '')

  if (role === 'assistant') {
    return marked.parse(text)
  }

  return escapeHtml(text)
}
