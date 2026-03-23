import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sidepanelHtml = readFileSync(
  resolve(process.cwd(), 'extension/sidepanel.html'),
  'utf8'
)
const sidepanelCss = readFileSync(
  resolve(process.cwd(), 'extension/sidepanel.css'),
  'utf8'
)
const sidepanelJs = readFileSync(
  resolve(process.cwd(), 'extension/sidepanel.js'),
  'utf8'
)

describe('sidepanel export button placement', () => {
  it('places the export action in the main ready-state actions', () => {
    expect(sidepanelHtml).toMatch(
      /<div class="actions">[\s\S]*id="summarize-btn"[\s\S]*id="view-subtitles-btn"[\s\S]*id="export-subtitles-btn"[\s\S]*<\/div>/
    )
  })

  it('does not keep the export action inside the subtitles toolbar', () => {
    expect(sidepanelHtml).not.toMatch(/<div class="subtitles-toolbar">[\s\S]*subtitles-export-btn[\s\S]*<\/div>/)
  })

  it('renders a workspace shell with summary, chat, and timeline tabs', () => {
    expect(sidepanelHtml).toMatch(/class="workspace-shell state"/)
    expect(sidepanelHtml).toMatch(/id="workspace-tab-summary"/)
    expect(sidepanelHtml).toMatch(/id="workspace-tab-chat"/)
    expect(sidepanelHtml).toMatch(/id="workspace-tab-timeline"/)
  })

  it('renders a dedicated chat panel with messages, input, and restart action', () => {
    expect(sidepanelHtml).toMatch(/id="workspace-panel-chat"/)
    expect(sidepanelHtml).toMatch(/id="chat-messages"/)
    expect(sidepanelHtml).toMatch(/id="chat-form"/)
    expect(sidepanelHtml).toMatch(/id="chat-input"/)
    expect(sidepanelHtml).toMatch(/id="chat-restart-btn"/)
  })

  it('renders a stale summary notice with a refresh action', () => {
    expect(sidepanelHtml).toMatch(/id="summary-refresh-notice"/)
    expect(sidepanelHtml).toMatch(/id="summary-refresh-btn"/)
  })

  it('does not hardcode new UI copy that should come from i18n', () => {
    expect(sidepanelHtml).not.toContain('Active video')
    expect(sidepanelHtml).not.toContain('Language')
    expect(sidepanelHtml).not.toContain('Transcript')
    expect(sidepanelHtml).not.toContain('Standby')
    expect(sidepanelHtml).not.toContain('Transcript agent')
    expect(sidepanelHtml).not.toContain('Editorial brief')
    expect(sidepanelHtml).not.toContain('Segment map')
    expect(sidepanelHtml).not.toContain('Something interrupted the workspace')
    expect(sidepanelHtml).not.toContain('Ask about this video')
  })

  it('keeps chat bubbles full width to avoid streaming layout jitter', () => {
    expect(sidepanelCss).toMatch(/\.chat-message\s*\{[\s\S]*width:\s*100%/)
    expect(sidepanelCss).toMatch(/\.chat-messages[\s\S]*width:\s*100%/)
  })

  it('reserves stable scrollbar space so chat bubble width does not change while streaming', () => {
    expect(sidepanelCss).toMatch(/\.chat-messages[\s\S]*scrollbar-gutter:\s*stable/)
  })

  it('locks chat workspace containers to full width during streaming', () => {
    expect(sidepanelCss).toMatch(/\.workspace-shell\s*\{[^}]*width:\s*100%/)
    expect(sidepanelCss).toMatch(/\.workspace-stage\s*\{[^}]*width:\s*100%/)
    expect(sidepanelCss).toMatch(/\.workspace-panel-shell\s*\{[^}]*width:\s*100%/)
    expect(sidepanelCss).toMatch(/\.chat-stage\s*\{[^}]*width:\s*100%/)
    expect(sidepanelCss).toMatch(/\.workspace-panel-shell\s*\{[^}]*min-width:\s*0/)
    expect(sidepanelCss).toMatch(/\.chat-stage\s*\{[^}]*min-width:\s*0/)
  })

  it('uses refreshed no-video copy and keeps message buttons from being squashed', () => {
    expect(sidepanelJs).toContain("noVideo: '请打开可支持的页面'")
    expect(sidepanelHtml).toMatch(/id="no-video-retry-btn"/)
    expect(sidepanelJs).toContain("pageReconnectBody: '当前页面还没有重新连接到插件。请点击重试刷新当前页面。'")
    expect(sidepanelJs).toContain("cannotConnectPage: '无法连接到页面；如果你刚刚重载了插件，请刷新当前页面后重试'")
    expect(sidepanelJs).toContain("function reloadCurrentTab()")
    expect(sidepanelJs).toContain("chrome.tabs.reload(tab.id)")
    expect(sidepanelCss).toMatch(/\.state-message\s+button\s*\{[\s\S]*flex-shrink:\s*0/)
    expect(sidepanelCss).toMatch(/\.state-message\s+button\s*\{[\s\S]*min-width:\s*96px/)
    expect(sidepanelCss).toMatch(/button\s*\{[^}]*display:\s*inline-flex/)
    expect(sidepanelCss).toMatch(/button\s*\{[^}]*align-items:\s*center/)
    expect(sidepanelCss).toMatch(/button\s*\{[^}]*justify-content:\s*center/)
  })

  it('styles per-message copy actions for chat bubbles', () => {
    expect(sidepanelJs).toContain('chat-copy-btn')
    expect(sidepanelCss).toMatch(/\.chat-copy-btn\s*\{[\s\S]*border-radius:/)
  })
})
