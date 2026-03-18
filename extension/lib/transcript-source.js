export async function fetchTranscriptForVideo(videoId, language, options = {}) {
  const {
    getCachedTranscript,
    runTimedtextPrefetch,
    waitForTimedtextActivity,
    getRecentTimedtextUrls,
    fetchTranscriptByTrackUrl,
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

  const fetchFromObservedTrackUrls = async () => {
    const urls = getRecentTimedtextUrls?.(videoId) || []
    if (urls.length === 0 || typeof fetchTranscriptByTrackUrl !== 'function') {
      return null
    }

    const result = await fetchTranscriptByTrackUrl(urls, language)
    return result?.success ? result : null
  }

  const cached = readCached(true)
  if (cached) return cached

  if (!allowAutomation) {
    const observedTimedtextUrls = getRecentTimedtextUrls?.(videoId) || []

    await waitForTimedtextActivity?.(videoId, 2200, 160)

    const observedCached = readCached(true)
    if (observedCached) return observedCached

    const observedAnyLanguage = readCached(false)
    if (observedAnyLanguage) return observedAnyLanguage

    const fetchedFromObservedTrackUrls = await fetchFromObservedTrackUrls()
    if (fetchedFromObservedTrackUrls) return fetchedFromObservedTrackUrls

    if (observedTimedtextUrls.length === 0) {
      return { success: false, error: 'MANUAL_CAPTIONS_REQUIRED' }
    }

    return { success: false, error: 'NO_CAPTIONS' }
  }

  await runTimedtextPrefetch?.(videoId, language)

  const warmedCached = readCached(true)
  if (warmedCached) return warmedCached

  const warmedAnyLanguage = readCached(false)
  if (warmedAnyLanguage) return warmedAnyLanguage

  await waitForTimedtextActivity?.(videoId, 2200, 160)

  const delayedAnyLanguage = readCached(false)
  if (delayedAnyLanguage) return delayedAnyLanguage

  const fetchedFromObservedTrackUrls = await fetchFromObservedTrackUrls()
  if (fetchedFromObservedTrackUrls) return fetchedFromObservedTrackUrls

  return { success: false, error: 'NO_CAPTIONS' }
}
