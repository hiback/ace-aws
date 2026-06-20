import path from 'node:path'
import { type Browser, chromium, devices } from 'playwright'
import { resolveChromiumExecutable } from './browser'
import {
  assertUniqueReadmeScreenshotOutputs,
  README_SCREENSHOT_ASSET_DIR,
  README_SCREENSHOT_MANIFEST,
  type ReadmeScreenshotEntry,
} from './manifest'

const FIXED_NOW = Date.parse('2026-01-15T09:00:00.000Z')
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

  const executablePath = resolveChromiumExecutable({
    env,
    executablePathFromPlaywright: chromium.executablePath(),
  })
  const browser = await chromium.launch({ executablePath })

  try {
    for (const entry of manifest) {
      await captureEntry(browser, baseUrl, entry)
    }
  } finally {
    await browser.close()
  }
}

async function captureEntry(browser: Browser, baseUrl: string, entry: ReadmeScreenshotEntry) {
  const origin = new URL(baseUrl).origin
  const context = await browser.newContext({
    ...devices['iPhone 15'],
    colorScheme: 'light',
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
    await context.route('**/api/auth/session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    )
    await context.addInitScript(
      ({ fixedNow, locale, prefsKey }) => {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(
          prefsKey,
          JSON.stringify({
            state: {
              locale,
              theme: 'light',
              currentCert: 'DVA-C02',
            },
            version: 0,
          }),
        )

        const OriginalDate = Date
        function FixedDate(this: Date, ...args: unknown[]) {
          const date =
            args.length === 0
              ? new OriginalDate(fixedNow)
              : args.length === 1
                ? new OriginalDate(args[0] as string | number | Date)
                : new OriginalDate(
                    ...(args as [
                      number,
                      number,
                      number | undefined,
                      number | undefined,
                      number | undefined,
                      number | undefined,
                      number | undefined,
                    ]),
                  )
          Object.setPrototypeOf(date, FixedDate.prototype)
          return date
        }
        FixedDate.now = () => fixedNow
        FixedDate.parse = OriginalDate.parse
        FixedDate.UTC = OriginalDate.UTC
        FixedDate.prototype = OriginalDate.prototype
        globalThis.Date = FixedDate as unknown as DateConstructor
      },
      {
        fixedNow: FIXED_NOW,
        locale: entry.locale,
        prefsKey: PREFS_KEY,
      },
    )

    const page = await context.newPage()
    await page.goto(new URL(entry.path, baseUrl).toString(), { waitUntil: 'domcontentloaded' })
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
