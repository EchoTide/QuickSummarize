import { describe, it, expect } from 'vitest'
import { getReleaseVersion, getReleaseArchiveName } from '../scripts/release-zip.mjs'

describe('release zip helpers', () => {
  it('uses package version when no explicit tag is provided', () => {
    expect(getReleaseVersion({ packageVersion: '0.1.0' })).toBe('0.1.0')
  })

  it('strips a leading v from release tags', () => {
    expect(getReleaseVersion({ packageVersion: '0.1.0', releaseTag: 'v1.2.3' })).toBe('1.2.3')
  })

  it('builds the expected release archive name', () => {
    expect(getReleaseArchiveName('1.2.3')).toBe('quicksummarize-v1.2.3.zip')
  })
})
