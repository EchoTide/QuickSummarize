import { describe, it, expect } from 'vitest'

import { renderChatContent, getChatRoleLabel, getChatCopyLabel } from '../extension/lib/chat-render.js'

describe('chat render helpers', () => {
  it('renders assistant markdown into HTML', () => {
    const html = renderChatContent('assistant', '## Title\n\n- one\n- two')

    expect(html).toContain('<h2>Title</h2>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('escapes user content instead of parsing markdown', () => {
    const html = renderChatContent('user', '<script>alert(1)</script> **hello**')

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; **hello**')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<strong>hello</strong>')
  })

  it('returns localized role labels', () => {
    expect(getChatRoleLabel('assistant', 'zh')).toBe('助手')
    expect(getChatRoleLabel('user', 'zh')).toBe('你')
    expect(getChatRoleLabel('assistant', 'en')).toBe('Assistant')
    expect(getChatRoleLabel('user', 'en')).toBe('You')
  })

  it('returns localized copy labels', () => {
    expect(getChatCopyLabel('en')).toBe('Copy')
    expect(getChatCopyLabel('zh')).toBe('复制')
  })
})
