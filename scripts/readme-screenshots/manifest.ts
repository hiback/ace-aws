export type ReadmeScreenshotLocale = 'en' | 'zh'

export interface ReadmeScreenshotEntry {
  name: string
  path: string
  locale: ReadmeScreenshotLocale
  output: string
  fixture?: 'stats'
  theme?: 'light' | 'dark'
  auth?: 'signed-in'
  capture?: {
    scrollTo?: 'explanation'
  }
}

export const README_SCREENSHOT_ASSET_DIR = 'assets/readme'

export const README_SCREENSHOT_MANIFEST: ReadmeScreenshotEntry[] = [
  { name: 'home-en', path: '/', locale: 'en', output: 'home-en.png' },
  { name: 'home-zh', path: '/', locale: 'zh', output: 'home-zh.png' },
  {
    name: 'list-all-en',
    path: '/list',
    locale: 'en',
    output: 'list-all-en.png',
  },
  {
    name: 'list-all-zh',
    path: '/list',
    locale: 'zh',
    output: 'list-all-zh.png',
  },
  {
    name: 'list-bookmarks-en',
    path: '/list/bookmarks',
    locale: 'en',
    output: 'list-bookmarks-en.png',
  },
  {
    name: 'list-bookmarks-zh',
    path: '/list/bookmarks',
    locale: 'zh',
    output: 'list-bookmarks-zh.png',
  },
  {
    name: 'list-wrong-en',
    path: '/list/wrong',
    locale: 'en',
    output: 'list-wrong-en.png',
  },
  {
    name: 'list-wrong-zh',
    path: '/list/wrong',
    locale: 'zh',
    output: 'list-wrong-zh.png',
  },
  {
    name: 'stats-en',
    path: '/stats',
    locale: 'en',
    output: 'stats-en.png',
    fixture: 'stats',
  },
  {
    name: 'stats-zh',
    path: '/stats',
    locale: 'zh',
    output: 'stats-zh.png',
    fixture: 'stats',
  },
  {
    name: 'mock-exam-en',
    path: '/mock-exam/attempt/readme-clf-c02-draft/1',
    locale: 'en',
    output: 'mock-exam-en.png',
  },
  {
    name: 'mock-exam-zh',
    path: '/mock-exam/attempt/readme-clf-c02-draft/1',
    locale: 'zh',
    output: 'mock-exam-zh.png',
  },
  {
    name: 'mock-exam-history-en',
    path: '/mock-exam/clf-c02/history',
    locale: 'en',
    output: 'mock-exam-history-en.png',
  },
  {
    name: 'mock-exam-history-zh',
    path: '/mock-exam/clf-c02/history',
    locale: 'zh',
    output: 'mock-exam-history-zh.png',
  },
  {
    name: 'mock-exam-result-en',
    path: '/mock-exam/attempt/readme-clf-c02-submitted/result',
    locale: 'en',
    output: 'mock-exam-result-en.png',
  },
  {
    name: 'mock-exam-result-zh',
    path: '/mock-exam/attempt/readme-clf-c02-submitted/result',
    locale: 'zh',
    output: 'mock-exam-result-zh.png',
  },
  {
    name: 'mock-exam-sheet-en',
    path: '/mock-exam/attempt/readme-clf-c02-draft/sheet',
    locale: 'en',
    output: 'mock-exam-sheet-en.png',
  },
  {
    name: 'mock-exam-sheet-zh',
    path: '/mock-exam/attempt/readme-clf-c02-draft/sheet',
    locale: 'zh',
    output: 'mock-exam-sheet-zh.png',
  },
  {
    name: 'practice-correct-en',
    path: '/practice/clf-c02/2',
    locale: 'en',
    output: 'practice-correct-en.png',
  },
  {
    name: 'practice-correct-zh',
    path: '/practice/clf-c02/2',
    locale: 'zh',
    output: 'practice-correct-zh.png',
  },
  {
    name: 'practice-en',
    path: '/practice/clf-c02/1',
    locale: 'en',
    output: 'practice-en.png',
  },
  {
    name: 'practice-explanation-en',
    path: '/practice/clf-c02/4',
    locale: 'en',
    output: 'practice-explanation-en.png',
    capture: { scrollTo: 'explanation' },
  },
  {
    name: 'practice-explanation-zh',
    path: '/practice/clf-c02/4',
    locale: 'zh',
    output: 'practice-explanation-zh.png',
    capture: { scrollTo: 'explanation' },
  },
  {
    name: 'practice-wrong-en',
    path: '/practice/clf-c02/3',
    locale: 'en',
    output: 'practice-wrong-en.png',
  },
  {
    name: 'practice-wrong-zh',
    path: '/practice/clf-c02/3',
    locale: 'zh',
    output: 'practice-wrong-zh.png',
  },
  {
    name: 'practice-zh',
    path: '/practice/clf-c02/1',
    locale: 'zh',
    output: 'practice-zh.png',
  },
  {
    name: 'settings-dark-en',
    path: '/settings',
    locale: 'en',
    output: 'settings-dark-en.png',
    theme: 'dark',
    auth: 'signed-in',
  },
  {
    name: 'settings-dark-zh',
    path: '/settings',
    locale: 'zh',
    output: 'settings-dark-zh.png',
    theme: 'dark',
    auth: 'signed-in',
  },
  {
    name: 'settings-en',
    path: '/settings',
    locale: 'en',
    output: 'settings-en.png',
    auth: 'signed-in',
  },
  {
    name: 'settings-zh',
    path: '/settings',
    locale: 'zh',
    output: 'settings-zh.png',
    auth: 'signed-in',
  },
]

export function assertUniqueReadmeScreenshotOutputs(entries: ReadmeScreenshotEntry[]) {
  const seen = new Set<string>()

  for (const entry of entries) {
    if (seen.has(entry.output)) {
      throw new Error(`Duplicate README screenshot output: ${entry.output}`)
    }
    seen.add(entry.output)
  }
}
