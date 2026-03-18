import { describe, it, expect } from 'vitest'

import {
  getWorkspaceCapabilities,
  getSourceLabels,
  resolveWorkspaceSourceType,
} from '../extension/lib/workspace-mode.js'

describe('getWorkspaceCapabilities', () => {
  it('keeps timeline and export enabled for youtube', () => {
    expect(getWorkspaceCapabilities('youtube')).toEqual({
      canSummarize: true,
      canChat: true,
      canViewTimeline: true,
      canExportSubtitles: true,
    })
  })

  it('limits webpage mode to summary and chat', () => {
    expect(getWorkspaceCapabilities('webpage')).toEqual({
      canSummarize: true,
      canChat: true,
      canViewTimeline: false,
      canExportSubtitles: false,
    })
  })

  it('keeps unsupported mode neutral and non-video-specific', () => {
    expect(getWorkspaceCapabilities('unsupported')).toEqual({
      canSummarize: false,
      canChat: false,
      canViewTimeline: false,
      canExportSubtitles: false,
    })
  })
})

describe('getSourceLabels', () => {
  it('returns webpage labels without transcript-oriented wording', () => {
    expect(getSourceLabels('webpage', 'en')).toEqual(
      expect.objectContaining({
        eyebrow: 'Current page',
        metaLabel: 'Focus',
      })
    )
  })

  it('returns neutral labels for unsupported pages', () => {
    expect(getSourceLabels('unsupported', 'zh')).toEqual(
      expect.objectContaining({
        eyebrow: '当前页面',
        metaLabel: '状态',
        readinessLabel: '上下文',
      })
    )
  })
})

describe('resolveWorkspaceSourceType', () => {
  it('returns unsupported when page context is unsupported', () => {
    expect(resolveWorkspaceSourceType({ sourceType: 'unsupported' })).toBe('unsupported')
  })

  it('returns webpage when page context is webpage', () => {
    expect(resolveWorkspaceSourceType({ sourceType: 'webpage' })).toBe('webpage')
  })

  it('falls back to youtube for transcript pages', () => {
    expect(resolveWorkspaceSourceType({ sourceType: 'youtube' })).toBe('youtube')
    expect(resolveWorkspaceSourceType(null)).toBe('youtube')
  })
})
