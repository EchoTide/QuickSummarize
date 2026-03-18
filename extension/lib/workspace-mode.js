export function resolveWorkspaceSourceType(pageContext = null) {
  if (pageContext?.sourceType === 'unsupported') return 'unsupported'
  if (pageContext?.sourceType === 'webpage') return 'webpage'
  return 'youtube'
}

export function getWorkspaceCapabilities(sourceType = 'youtube') {
  if (sourceType === 'unsupported') {
    return {
      canSummarize: false,
      canChat: false,
      canViewTimeline: false,
      canExportSubtitles: false,
    }
  }

  if (sourceType === 'webpage') {
    return {
      canSummarize: true,
      canChat: true,
      canViewTimeline: false,
      canExportSubtitles: false,
    }
  }

  return {
    canSummarize: true,
    canChat: true,
    canViewTimeline: true,
    canExportSubtitles: true,
  }
}

export function getSourceLabels(sourceType = 'youtube', language = 'en') {
  const isZh = language === 'zh'
  if (sourceType === 'unsupported') {
    return isZh
      ? {
          eyebrow: '当前页面',
          metaLabel: '状态',
          readinessLabel: '上下文',
        }
      : {
          eyebrow: 'Current page',
          metaLabel: 'Status',
          readinessLabel: 'Context',
        }
  }

  if (sourceType === 'webpage') {
    return isZh
      ? {
          eyebrow: '当前网页',
          metaLabel: '焦点',
          readinessLabel: '上下文',
        }
      : {
          eyebrow: 'Current page',
          metaLabel: 'Focus',
          readinessLabel: 'Context',
        }
  }

  return isZh
    ? {
        eyebrow: '当前视频',
        metaLabel: '语言',
        readinessLabel: '字幕',
      }
    : {
        eyebrow: 'Active video',
        metaLabel: 'Language',
        readinessLabel: 'Transcript',
      }
}
