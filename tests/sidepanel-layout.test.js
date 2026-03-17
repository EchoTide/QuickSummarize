import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sidepanelHtml = readFileSync(
  resolve(process.cwd(), 'extension/sidepanel.html'),
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
})
