import path from 'node:path'
import { type Browser, type BrowserContext, chromium, devices } from 'playwright'
import clfBank from '../../src/data/clf-c02.json'
import type { Question } from '../../src/data/types'
import { resolveChromiumExecutable } from './browser'
import {
  buildReadmeScreenshotFixtureState,
  README_SCREENSHOT_FIXED_NOW,
  README_SCREENSHOT_USER_ID,
  type ReadmeScreenshotFixtureState,
} from './fixtures'
import {
  assertUniqueReadmeScreenshotOutputs,
  README_SCREENSHOT_ASSET_DIR,
  README_SCREENSHOT_MANIFEST,
  type ReadmeScreenshotEntry,
} from './manifest'

const PREFS_KEY = 'ace-aws/prefs/v1'
const ONBOARDING_COOKIES = [
  { name: 'ace-aws-auth-gate', value: 'completed' },
  { name: 'ace-aws-cert-selected', value: 'true' },
]

export interface CaptureReadmeScreenshotsOptions {
  baseUrl: string
  env?: NodeJS.ProcessEnv
  manifest?: ReadmeScreenshotEntry[]
}

export async function captureReadmeScreenshots({
  baseUrl,
  env = process.env,
  manifest = README_SCREENSHOT_MANIFEST,
}: CaptureReadmeScreenshotsOptions) {
  assertUniqueReadmeScreenshotOutputs(manifest)

  const fixtureState = buildReadmeScreenshotFixtureState(clfBank as Question[])
  const executablePath = resolveChromiumExecutable({
    env,
    executablePathFromPlaywright: chromium.executablePath(),
  })
  const browser = await chromium.launch({ executablePath })

  try {
    for (const entry of manifest) {
      await captureEntry(browser, baseUrl, entry, fixtureState)
    }
  } finally {
    await browser.close()
  }
}

async function captureEntry(
  browser: Browser,
  baseUrl: string,
  entry: ReadmeScreenshotEntry,
  fixtureState: ReadmeScreenshotFixtureState,
) {
  const origin = new URL(baseUrl).origin
  const theme = entry.theme ?? 'light'
  const context = await browser.newContext({
    ...devices['iPhone 15'],
    colorScheme: theme,
    locale: entry.locale === 'zh' ? 'zh-CN' : 'en-US',
    timezoneId: 'Asia/Tokyo',
  })

  try {
    await context.addCookies(
      ONBOARDING_COOKIES.map((cookie) => ({
        ...cookie,
        url: origin,
        sameSite: 'Lax',
      })),
    )
    await mockReadmeScreenshotApis(context, entry, fixtureState)
    await context.addInitScript(
      ({ locale, prefsKey, storage, theme }) => {
        localStorage.clear()
        sessionStorage.clear()
        for (const [key, value] of Object.entries(storage)) {
          localStorage.setItem(key, value)
        }
        localStorage.setItem(
          prefsKey,
          JSON.stringify({
            state: {
              locale,
              theme,
              currentCert: 'CLF-C02',
            },
            version: 0,
          }),
        )
      },
      {
        locale: entry.locale,
        prefsKey: PREFS_KEY,
        storage: storageForEntry(entry, fixtureState),
        theme,
      },
    )

    const page = await context.newPage()
    await page.clock.install({ time: new Date(README_SCREENSHOT_FIXED_NOW) })
    await gotoEntryPath(page, baseUrl, entry.path)
    await page.locator('main').waitFor({ state: 'visible' })
    await page.addStyleTag({
      content: 'nextjs-portal, [data-next-badge-root] { display: none !important; }',
    })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    await page.waitForTimeout(250)
    await page.screenshot({
      path: path.join(README_SCREENSHOT_ASSET_DIR, entry.output),
      scale: 'css',
    })
    console.log(`Captured ${entry.output}`)
  } finally {
    await context.close()
  }
}

async function gotoEntryPath(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  baseUrl: string,
  entryPath: string,
) {
  if (entryPath.startsWith('/list')) {
    await gotoListEntryPath(page, baseUrl, entryPath)
    return
  }

  const targetUrl = new URL(entryPath, baseUrl).toString()
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  if (entryPath === '/') return

  await page.waitForTimeout(150)
  if (new URL(page.url()).pathname !== new URL(targetUrl).pathname) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(targetUrl, { timeout: 5_000 }).catch(() => undefined)
  }
}

async function gotoListEntryPath(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  baseUrl: string,
  entryPath: string,
) {
  await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' })
  await page.locator('a[href="/list"]').waitFor({ state: 'visible' })

  if (entryPath === '/list/bookmarks') {
    await page.locator('a[href="/list/bookmarks"]').click()
    await page.waitForURL(new URL('/list/bookmarks', baseUrl).toString())
    return
  }

  await page.locator('a[href="/list"]').click()
  await page.waitForURL(new URL('/list', baseUrl).toString())

  if (entryPath === '/list/wrong') {
    await page.locator('a[href="/list/wrong"]').click()
    await page.waitForURL(new URL('/list/wrong', baseUrl).toString())
  }
}

function storageForEntry(entry: ReadmeScreenshotEntry, fixtureState: ReadmeScreenshotFixtureState) {
  const storage = { ...fixtureState.localStorage }
  if (!entry.output.startsWith('mock-exam-')) {
    delete storage['ace-aws/mock-exam/local/v1']
  }
  if (entry.auth === 'signed-in') {
    delete storage['ace-aws/progress/v1']
  }
  return storage
}

async function mockReadmeScreenshotApis(
  context: BrowserContext,
  entry: ReadmeScreenshotEntry,
  fixtureState: ReadmeScreenshotFixtureState,
) {
  const progressState = JSON.parse(fixtureState.localStorage['ace-aws/progress/v1']) as {
    byCert: {
      'CLF-C02': {
        progress: Record<string, unknown>
        dailyStats: Record<string, unknown>
      }
    }
  }
  const mockExamState = JSON.parse(fixtureState.localStorage['ace-aws/mock-exam/local/v1']) as {
    submittedAttempts: { 'CLF-C02': Record<string, unknown> }
  }

  await context.route('**/api/auth/session', (route) => {
    const body =
      entry.auth === 'signed-in'
        ? {
            user: {
              id: README_SCREENSHOT_USER_ID,
              name: 'ace-aws maintainer',
              email: 'maintainer@example.com',
              image: null,
            },
            expires: new Date(README_SCREENSHOT_FIXED_NOW + 86_400_000).toISOString(),
          }
        : {}
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
  await context.route('**/api/account/preferences', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currentCert: 'CLF-C02' }),
    }),
  )
  await context.route('**/api/onboarding', (route) =>
    route.fulfill({ status: 204, contentType: 'application/json', body: '' }),
  )
  await context.route('**/api/progress/*/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cert: 'CLF-C02',
        revision: 7,
        progress: Object.values(progressState.byCert['CLF-C02'].progress).map(toProgressDto),
        dailyStats: Object.values(progressState.byCert['CLF-C02'].dailyStats).map(toDailyStatsDto),
      }),
    }),
  )
  await context.route('**/api/progress/*/sync', async (route) => {
    const requestBody = route.request().postDataJSON() as {
      progress?: unknown[]
      dailyStats?: unknown[]
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cert: 'CLF-C02',
        revision: 8,
        accepted: requestBody.progress ?? [],
        dailyStats: requestBody.dailyStats ?? [],
        rejected: [],
        snapshotRequired: false,
      }),
    })
  })
  await context.route('**/api/mock-exam/*/draft/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cert: 'CLF-C02', revision: 5, draft: null }),
    }),
  )
  await context.route('**/api/mock-exam/*/history/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cert: 'CLF-C02',
        revision: 5,
        submittedAttempts: Object.values(mockExamState.submittedAttempts['CLF-C02']),
      }),
    }),
  )
  await context.route('**/api/mock-exam/*/draft/sync', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cert: 'CLF-C02', revision: 6, draft: null }),
    }),
  )
  await context.route('**/api/mock-exam/*/history/sync', async (route) => {
    const requestBody = route.request().postDataJSON() as {
      submittedAttempts?: unknown[]
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cert: 'CLF-C02',
        revision: 6,
        submittedAttempts:
          requestBody.submittedAttempts ??
          Object.values(mockExamState.submittedAttempts['CLF-C02']),
      }),
    })
  })
}

function toProgressDto(entry: unknown) {
  const progress = entry as {
    qid: number
    correctCount: number
    wrongCount: number
    lastPicks: string[]
    lastCorrect: boolean | null
    lastAnsweredAt: number | null
    bookmarked: boolean
    bookmarkUpdatedAt: number | null
  }
  return {
    ...progress,
    lastAnsweredAt: toIso(progress.lastAnsweredAt),
    bookmarkUpdatedAt: toIso(progress.bookmarkUpdatedAt),
  }
}

function toDailyStatsDto(entry: unknown) {
  const stats = entry as {
    date: string
    correctCount: number
    wrongCount: number
    updatedAt: number
  }
  return {
    ...stats,
    sourceId: 'readme-fixture',
    updatedAt: toIso(stats.updatedAt),
  }
}

function toIso(value: number | null) {
  return value === null ? null : new Date(value).toISOString()
}
