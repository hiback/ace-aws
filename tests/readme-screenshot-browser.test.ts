import { describe, expect, it } from 'vitest'
import { resolveChromiumExecutable } from '../scripts/readme-screenshots/browser'

describe('resolveChromiumExecutable', () => {
  it('uses CHROMIUM_EXECUTABLE_PATH when that file exists', () => {
    const result = resolveChromiumExecutable({
      env: { CHROMIUM_EXECUTABLE_PATH: '/custom/chromium' },
      candidatePaths: ['/usr/bin/chromium'],
      executablePathFromPlaywright: '/playwright/chromium',
      exists: (path) => path === '/custom/chromium',
    })

    expect(result).toBe('/custom/chromium')
  })

  it('uses the first existing system candidate before Playwright managed Chromium', () => {
    const result = resolveChromiumExecutable({
      env: {},
      candidatePaths: ['/missing/chromium', '/usr/bin/chromium'],
      executablePathFromPlaywright: '/playwright/chromium',
      exists: (path) => path === '/usr/bin/chromium' || path === '/playwright/chromium',
    })

    expect(result).toBe('/usr/bin/chromium')
  })

  it('falls back to Playwright managed Chromium when no configured or system binary exists', () => {
    const result = resolveChromiumExecutable({
      env: {},
      candidatePaths: ['/missing/chromium'],
      executablePathFromPlaywright: '/playwright/chromium',
      exists: (path) => path === '/playwright/chromium',
    })

    expect(result).toBe('/playwright/chromium')
  })

  it('fails with an actionable install message when no Chromium executable is found', () => {
    expect(() =>
      resolveChromiumExecutable({
        env: {},
        candidatePaths: ['/missing/chromium'],
        executablePathFromPlaywright: '/missing/playwright-chromium',
        exists: () => false,
      }),
    ).toThrow(/CHROMIUM_EXECUTABLE_PATH.*pnpm exec playwright install chromium/)
  })
})
