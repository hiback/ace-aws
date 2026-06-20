import { describe, expect, it } from 'vitest'
import {
  assertUniqueReadmeScreenshotOutputs,
  README_SCREENSHOT_MANIFEST,
} from '../scripts/readme-screenshots/manifest'

describe('README screenshot manifest', () => {
  it('keeps bilingual Home screenshots on the existing README asset filenames', () => {
    expect(README_SCREENSHOT_MANIFEST).toEqual([
      { name: 'home-en', path: '/', locale: 'en', output: 'home-en.png' },
      { name: 'home-zh', path: '/', locale: 'zh', output: 'home-zh.png' },
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
