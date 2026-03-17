import { describe, it, expect } from 'vitest'
import { measureEmbedHeight } from '../extension/lib/embed-resize.js'

describe('measureEmbedHeight', () => {
  it('prefers intrinsic container height instead of viewport-height-like body/doc values', () => {
    const height = measureEmbedHeight({
      containerHeight: 180,
      bodyHeight: 820,
      documentHeight: 820,
      padding: 8,
      min: 160,
      max: 760,
    })

    expect(height).toBe(188)
  })

  it('clamps to max height when container is too large', () => {
    const height = measureEmbedHeight({
      containerHeight: 980,
      bodyHeight: 980,
      documentHeight: 980,
      padding: 8,
      min: 160,
      max: 760,
    })

    expect(height).toBe(760)
  })
})
