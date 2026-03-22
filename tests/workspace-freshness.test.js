import { describe, it, expect } from 'vitest'

import {
  buildWorkspaceSourceSignature,
  isWorkspaceSnapshotStale,
} from '../extension/lib/workspace-freshness.js'

describe('workspace freshness', () => {
  it('produces the same signature for equivalent webpage content', () => {
    const left = buildWorkspaceSourceSignature({
      sourceType: 'webpage',
      pageKey: 'https://example.com/a',
      title: 'Example',
      contentText: 'Hello world',
      focusText: 'Hello world',
    })
    const right = buildWorkspaceSourceSignature({
      sourceType: 'webpage',
      pageKey: 'https://example.com/a',
      title: 'Example',
      contentText: 'Hello   world',
      focusText: 'Hello world',
    })

    expect(left).toBe(right)
  })

  it('marks a restored snapshot stale when webpage content changes after refresh', () => {
    const snapshotSignature = buildWorkspaceSourceSignature({
      sourceType: 'webpage',
      pageKey: 'https://example.com/a',
      title: 'Example',
      contentText: 'Old body copy',
      focusText: 'Old body copy',
    })

    expect(
      isWorkspaceSnapshotStale({
        snapshotSignature,
        context: {
          sourceType: 'webpage',
          pageKey: 'https://example.com/a',
          title: 'Example',
          contentText: 'New refreshed article body',
          focusText: 'New refreshed article body',
        },
      })
    ).toBe(true)
  })

  it('does not mark a restored snapshot stale for the same youtube video', () => {
    const snapshotSignature = buildWorkspaceSourceSignature(
      {
        sourceType: 'youtube',
        pageKey: 'youtube:abc123',
        title: 'Video title',
        videoId: 'abc123',
      },
      { videoId: 'abc123', title: 'Video title' }
    )

    expect(
      isWorkspaceSnapshotStale({
        snapshotSignature,
        context: {
          sourceType: 'youtube',
          pageKey: 'youtube:abc123',
          title: 'Video title',
          videoId: 'abc123',
        },
        videoInfo: { videoId: 'abc123', title: 'Video title' },
      })
    ).toBe(false)
  })
})
