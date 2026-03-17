export function normalizeLanguage(language) {
  return language === 'zh' ? 'zh' : 'en'
}

export function nextLanguage(language) {
  return normalizeLanguage(language) === 'zh' ? 'en' : 'zh'
}

export function getLanguageToggleLabel(language) {
  return normalizeLanguage(language) === 'zh' ? 'EN' : 'ZH'
}
