export async function fetchTranscriptForVideo(videoId, language, options = {}) {
  const {
    getCachedTranscript,
    runTimedtextPrefetch,
    waitForTimedtextActivity,
    getRecentTimedtextUrls,
    allowAutomation = true,
  } = options

  if (!videoId) {
    return { success: false, error: 'NO_VIDEO_ID' }
  }

  const readCached = (matchLanguage = true) => {
    const cached = getCachedTranscript?.(videoId, language, { matchLanguage })
    if (!cached) return null
    return {
      success: true,
      text: cached.text,
      segments: cached.segments,
    }
  }

  const cached = readCached(true)
  if (cached) return cached

  if (!allowAutomation) {
    return { success: false, error: 'MANUAL_CAPTIONS_REQUIRED' }
  }

  await runTimedtextPrefetch?.(videoId, language)

  const warmedCached = readCached(true)
  if (warmedCached) return warmedCached

  const warmedAnyLanguage = readCached(false)
  if (warmedAnyLanguage) return warmedAnyLanguage

  await waitForTimedtextActivity?.(videoId, 2200, 160)

  const delayedAnyLanguage = readCached(false)
  if (delayedAnyLanguage) return delayedAnyLanguage

  return { success: false, error: 'NO_CAPTIONS' }
}
