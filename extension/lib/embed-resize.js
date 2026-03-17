function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function measureEmbedHeight({
  containerHeight = 0,
  bodyHeight = 0,
  documentHeight = 0,
  padding = 8,
  min = 160,
  max = 760,
} = {}) {
  const intrinsic = Number(containerHeight) || 0
  const fallback = Math.max(Number(bodyHeight) || 0, Number(documentHeight) || 0)
  const base = intrinsic > 0 ? intrinsic : fallback

  return clamp(Math.ceil(base + Number(padding || 0)), min, max)
}
