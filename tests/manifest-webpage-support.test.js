import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'extension/manifest.json'), 'utf8')
)
const buildScript = readFileSync(resolve(process.cwd(), 'build.js'), 'utf8')

describe('webpage support manifest wiring', () => {
  it('adds context menu permission for non-intrusive webpage entry points', () => {
    expect(manifest.permissions).toContain('contextMenus')
  })

  it('builds the generic webpage content script bundle', () => {
    expect(buildScript).toContain("'extension/webpage-content.js'")
  })

  it('builds the background worker bundle and points manifest to the built file', () => {
    expect(buildScript).toContain("'extension/background.js'")
    expect(manifest.background).toEqual({
      service_worker: 'dist/background.js',
    })
  })

  it('registers a generic webpage content script without changing the youtube-only script scope', () => {
    expect(manifest.content_scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matches: ['https://www.youtube.com/*'],
          js: ['dist/content.js'],
        }),
        expect.objectContaining({
          matches: ['https://*/*', 'http://*/*'],
          exclude_matches: ['https://www.youtube.com/*'],
          js: ['dist/webpage-content.js'],
        }),
      ])
    )
  })
})
