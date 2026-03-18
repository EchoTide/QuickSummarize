import { extractVideoIdFromUrl, isYouTubeVideoUrl } from './video-page.js'
import { isRestrictedPageUrl } from './webpage-context.js'

export async function resolveActivePageContext({
  tab = null,
  requestVideoInfo,
  requestPageContext,
} = {}) {
  const tabUrl = String(tab?.url || '')

  if (!tab || !tab.id || !tabUrl) {
    return {
      sourceType: 'unsupported',
      error: 'UNSUPPORTED_PAGE',
      title: '',
      url: '',
    }
  }

  if (isYouTubeVideoUrl(tabUrl)) {
    const videoInfo = await requestVideoInfo?.(tab.id)
    const videoId = String(videoInfo?.videoId || extractVideoIdFromUrl(tabUrl) || '')
    return {
      sourceType: 'youtube',
      videoId,
      title: String(videoInfo?.title || tab.title || ''),
      url: tabUrl,
    }
  }

  if (isRestrictedPageUrl(tabUrl)) {
    return {
      sourceType: 'unsupported',
      error: 'UNSUPPORTED_PAGE',
      title: String(tab?.title || ''),
      url: tabUrl,
    }
  }

  const webpageContext = await requestPageContext?.(tab.id)
  if (webpageContext?.sourceType === 'webpage') {
    return webpageContext
  }

  return {
    sourceType: 'unsupported',
    error: 'EMPTY_CONTENT',
    title: String(tab?.title || ''),
    url: tabUrl,
  }
}
