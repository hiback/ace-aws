export type ReadmeScreenshotLocale = 'en' | 'zh'

export interface ReadmeScreenshotEntry {
  name: string
  path: string
  locale: ReadmeScreenshotLocale
  output: string
}

export const README_SCREENSHOT_ASSET_DIR = 'assets/readme'

export const README_SCREENSHOT_MANIFEST: ReadmeScreenshotEntry[] = [
  { name: 'home-en', path: '/', locale: 'en', output: 'home-en.png' },
  { name: 'home-zh', path: '/', locale: 'zh', output: 'home-zh.png' },
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
