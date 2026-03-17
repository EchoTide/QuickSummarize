;(() => {
  const HOOK_GUARD = '__QUICK_SUMMARIZE_PAGE_HOOKED__'
  const CHANNEL = 'QUICK_SUMMARIZE_TIMEDTEXT'
  const MAX_CAPTURE_BYTES = 1_000_000

  if (window[HOOK_GUARD]) return
  window[HOOK_GUARD] = true

  const safePost = (type, payload = {}) => {
    try {
      window.postMessage({ source: CHANNEL, type, payload }, '*')
    } catch {
      // ignore post message errors
    }
  }

  const shouldCapture = (url) =>
    typeof url === 'string' && url.includes('/api/timedtext') && url.includes('v=')

  const normalizeTrackUrl = (url) =>
    String(url || '')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .trim()

  const getCurrentVideoId = () => {
    try {
      const parsed = new URL(window.location.href)
      const watchId = parsed.searchParams.get('v')
      if (watchId) return watchId

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
      return shortsMatch ? shortsMatch[1] : ''
    } catch {
      return ''
    }
  }

  const getMoviePlayer = () =>
    document.getElementById('movie_player') || document.querySelector('.html5-video-player')

  const getSubtitleButton = () => document.querySelector('.ytp-subtitles-button')

  const isPressedButton = (button) => {
    if (!button) return false
    const ariaPressed = button.getAttribute('aria-pressed')
    if (ariaPressed === 'true') return true
    if (ariaPressed === 'false') return false
    return button.classList.contains('ytp-button-pressed')
  }

  const safeInvoke = (target, method, ...args) => {
    try {
      if (typeof target?.[method] !== 'function') return undefined
      return target[method](...args)
    } catch {
      return undefined
    }
  }

  const normalizeLang = (value) => String(value || '').trim().toLowerCase()

  const isTargetLanguageCode = (languageCode, targetLanguage) => {
    const normalizedCode = normalizeLang(languageCode)
    if (!normalizedCode) return false

    if (targetLanguage === 'zh') {
      return normalizedCode === 'zh' || normalizedCode.startsWith('zh-')
    }

    if (targetLanguage === 'en') {
      return normalizedCode === 'en' || normalizedCode.startsWith('en-')
    }

    return false
  }

  const getTrackLanguageCode = (track) => {
    if (!track || typeof track !== 'object') return ''
    return (
      track.languageCode ||
      track.lang_code ||
      track.language_code ||
      track.id ||
      track.vss_id ||
      ''
    )
  }

  const pickTrackByLanguage = (tracks, targetLanguage) => {
    if (!Array.isArray(tracks) || tracks.length === 0) return null

    const normalizedTracks = tracks.filter((item) => item && typeof item === 'object')
    const exact = normalizedTracks.find((track) =>
      isTargetLanguageCode(getTrackLanguageCode(track), targetLanguage)
    )
    if (exact) return exact

    return normalizedTracks[0] || null
  }

  const collectCaptionTrackUrls = () => {
    const result = []
    const currentVideoId = getCurrentVideoId()

    const pushTrackList = (tracks) => {
      if (!Array.isArray(tracks)) return
      for (const track of tracks) {
        const rawBaseUrl = normalizeTrackUrl(track?.baseUrl || '')
        if (!rawBaseUrl || !shouldCapture(rawBaseUrl)) continue

        try {
          const parsed = new URL(rawBaseUrl, window.location.origin)
          if (currentVideoId) {
            const v = parsed.searchParams.get('v') || ''
            if (v && v !== currentVideoId) continue
          }
          result.push(parsed.toString())
        } catch {
          // ignore malformed track URL
        }
      }
    }

    const pushFromPlayerResponse = (response) => {
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      pushTrackList(tracks)
    }

    pushFromPlayerResponse(window.ytInitialPlayerResponse)

    const moviePlayer = getMoviePlayer()
    const playerResponse = safeInvoke(moviePlayer, 'getPlayerResponse')
    pushFromPlayerResponse(playerResponse)

    const rawPlayerResponse =
      window?.ytplayer?.config?.args?.raw_player_response ||
      window?.ytplayer?.config?.args?.player_response

    if (typeof rawPlayerResponse === 'string' && rawPlayerResponse.includes('captionTracks')) {
      try {
        pushFromPlayerResponse(JSON.parse(rawPlayerResponse))
      } catch {
        // ignore non-JSON player response
      }
    } else if (rawPlayerResponse && typeof rawPlayerResponse === 'object') {
      pushFromPlayerResponse(rawPlayerResponse)
    }

    return [...new Set(result)]
  }

  const emitCaptionTrackUrls = (reason = 'unknown') => {
    safePost('CAPTION_TRACK_URLS', {
      videoId: getCurrentVideoId(),
      urls: collectCaptionTrackUrls(),
      reason,
      ts: Date.now(),
    })
  }

  const tryWarmUpCaptionRequest = (targetLanguage = '') => {
    const player = getMoviePlayer()
    const button = getSubtitleButton()
    if (!player && !button) {
      return {
        touched: false,
        beforeEnabled: false,
        afterEnabled: false,
        hasPlayer: false,
        hasButton: false,
        attempts: [],
      }
    }

    const attempts = []
    let touched = false

    const isEnabled = () => {
      const playerValue = safeInvoke(player, 'isSubtitlesOn')
      if (typeof playerValue === 'boolean') return playerValue
      return isPressedButton(getSubtitleButton())
    }

    const beforeEnabled = isEnabled()

    if (typeof player.loadModule === 'function') {
      safeInvoke(player, 'loadModule', 'captions')
      touched = true
      attempts.push('loadModule(captions)')
    }

    if (!isEnabled() && typeof player?.toggleSubtitles === 'function') {
      safeInvoke(player, 'toggleSubtitles')
      touched = true
      attempts.push('toggleSubtitles()')
    }

    if (!isEnabled()) {
      const currentButton = getSubtitleButton()
      if (currentButton && !isPressedButton(currentButton)) {
        try {
          currentButton.click()
          touched = true
          attempts.push('subtitleButton.click()')
        } catch {
          // ignore click errors
        }
      }
    }

    const tracklist =
      safeInvoke(player, 'getOption', 'captions', 'tracklist') ||
      safeInvoke(player, 'getOption', 'captions', 'track')

    let selectedLanguageCode = ''

    if (Array.isArray(tracklist) && tracklist.length > 0 && typeof player?.setOption === 'function') {
      const preferredTrack =
        pickTrackByLanguage(tracklist, normalizeLang(targetLanguage)) ||
        (tracklist.find((item) => item && typeof item === 'object') || tracklist[0])

      selectedLanguageCode = getTrackLanguageCode(preferredTrack)
      safeInvoke(player, 'setOption', 'captions', 'track', preferredTrack)
      touched = true
      attempts.push('setOption(captions,track)')
    }

    if (typeof player?.setOption === 'function') {
      safeInvoke(player, 'setOption', 'captions', 'reload', true)
      touched = true
      attempts.push('setOption(captions,reload,true)')
    }

    return {
      touched,
      beforeEnabled,
      afterEnabled: isEnabled(),
      selectedLanguageCode,
      hasPlayer: Boolean(player),
      hasButton: Boolean(getSubtitleButton()),
      attempts,
    }
  }

  const emitResponse = (url, text, status = 0) => {
    if (!shouldCapture(url) || typeof text !== 'string') return
    safePost('TIMEDTEXT_RESPONSE', {
      url,
      text: text.slice(0, MAX_CAPTURE_BYTES),
      status,
      ts: Date.now(),
    })
  }

  const originalFetch = window.fetch
  if (typeof originalFetch === 'function') {
    window.fetch = function patchedFetch(...args) {
      const request = args[0]
      const url = typeof request === 'string' ? request : request?.url || ''
      const responsePromise = originalFetch.apply(this, args)

      Promise.resolve(responsePromise)
        .then((response) => {
          if (!shouldCapture(url) || !response) return
          try {
            response
              .clone()
              .text()
              .then((text) => emitResponse(url, text, response.status || 0))
              .catch(() => {})
          } catch {
            // ignore clone/text errors
          }
        })
        .catch(() => {})

      return responsePromise
    }
  }

  const XHR = window.XMLHttpRequest
  if (XHR?.prototype) {
    const originalOpen = XHR.prototype.open
    const originalSend = XHR.prototype.send

    XHR.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__qsTimedtextUrl = typeof url === 'string' ? url : String(url || '')
      return originalOpen.call(this, method, url, ...rest)
    }

    XHR.prototype.send = function patchedSend(...args) {
      this.addEventListener('load', () => {
        const url = this.responseURL || this.__qsTimedtextUrl || ''
        if (!shouldCapture(url)) return

        try {
          if (typeof this.responseText === 'string') {
            emitResponse(url, this.responseText, this.status || 0)
          }
        } catch {
          // ignore response read errors
        }
      })

      return originalSend.apply(this, args)
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return

    const data = event.data
    if (!data || data.source !== CHANNEL) return

    if (data.type === 'REQUEST_CAPTION_TRACKS') {
      emitCaptionTrackUrls('request')
      return
    }

    if (data.type === 'PREFETCH_TIMEDTEXT') {
      const result = tryWarmUpCaptionRequest(data.payload?.targetLanguage || '')
      safePost('PREFETCH_TIMEDTEXT_RESULT', { ...result, ts: Date.now() })
      setTimeout(() => emitCaptionTrackUrls('prefetch-120ms'), 120)
      setTimeout(() => emitCaptionTrackUrls('prefetch-600ms'), 600)
      setTimeout(() => emitCaptionTrackUrls('prefetch-1500ms'), 1500)
      return
    }

    if (data.type === 'SWITCH_CAPTION_LANGUAGE') {
      const targetLanguage = normalizeLang(data.payload?.targetLanguage)
      const result = tryWarmUpCaptionRequest(targetLanguage)
      safePost('CAPTION_LANGUAGE_SWITCH_RESULT', {
        targetLanguage,
        ...result,
        ts: Date.now(),
      })
      setTimeout(() => emitCaptionTrackUrls('switch-lang-120ms'), 120)
      setTimeout(() => emitCaptionTrackUrls('switch-lang-700ms'), 700)
    }
  })

  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => emitCaptionTrackUrls('yt-navigate-finish-80ms'), 80)
    setTimeout(() => emitCaptionTrackUrls('yt-navigate-finish-900ms'), 900)
  })

  safePost('HOOK_READY')
  emitCaptionTrackUrls('hook-ready')
  setTimeout(() => emitCaptionTrackUrls('hook-ready-900ms'), 900)
})()
