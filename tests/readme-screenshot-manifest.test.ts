import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assertUniqueReadmeScreenshotOutputs,
  README_SCREENSHOT_ASSET_DIR,
  README_SCREENSHOT_MANIFEST,
} from '../scripts/readme-screenshots/manifest'

describe('README screenshot manifest', () => {
  it('covers every existing README screenshot asset filename', () => {
    const existingAssets = fs
      .readdirSync(README_SCREENSHOT_ASSET_DIR)
      .filter((name) => name.endsWith('.png'))
      .sort()

    expect(README_SCREENSHOT_MANIFEST.map((entry) => entry.output).sort()).toEqual(existingAssets)
  })

  it('keeps bilingual entries for every README screenshot group', () => {
    const outputs = new Set(README_SCREENSHOT_MANIFEST.map((entry) => entry.output))

    for (const baseName of [
      'home',
      'list-all',
      'list-bookmarks',
      'list-wrong',
      'mock-exam',
      'mock-exam-history',
      'mock-exam-result',
      'mock-exam-sheet',
      'practice',
      'practice-correct',
      'practice-explanation',
      'practice-wrong',
      'settings',
      'settings-dark',
    ]) {
      expect(outputs.has(`${baseName}-en.png`), baseName).toBe(true)
      expect(outputs.has(`${baseName}-zh.png`), baseName).toBe(true)
    }
  })

  it('limits dark mode and signed-in auth to Settings screenshots', () => {
    expect(README_SCREENSHOT_MANIFEST.filter((entry) => entry.theme === 'dark')).toEqual([
      expect.objectContaining({ output: 'settings-dark-en.png', auth: 'signed-in' }),
      expect.objectContaining({ output: 'settings-dark-zh.png', auth: 'signed-in' }),
    ])
    expect(README_SCREENSHOT_MANIFEST.filter((entry) => entry.auth === 'signed-in')).toEqual([
      expect.objectContaining({ output: 'settings-dark-en.png' }),
      expect.objectContaining({ output: 'settings-dark-zh.png' }),
      expect.objectContaining({ output: 'settings-en.png' }),
      expect.objectContaining({ output: 'settings-zh.png' }),
    ])
  })

  it('rejects duplicate output filenames', () => {
    expect(() =>
      assertUniqueReadmeScreenshotOutputs([
        { name: 'first', path: '/', locale: 'en', output: 'home-en.png' },
        { name: 'second', path: '/', locale: 'zh', output: 'home-en.png' },
      ]),
    ).toThrow(/Duplicate README screenshot output: home-en\.png/)
  })
})
