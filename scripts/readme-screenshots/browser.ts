import { existsSync } from 'node:fs'

export interface ResolveChromiumExecutableOptions {
  env?: NodeJS.ProcessEnv
  candidatePaths?: string[]
  executablePathFromPlaywright?: string
  exists?: (path: string) => boolean
}

export const COMMON_CHROMIUM_EXECUTABLE_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

export function resolveChromiumExecutable({
  env = process.env,
  candidatePaths = COMMON_CHROMIUM_EXECUTABLE_PATHS,
  executablePathFromPlaywright,
  exists = existsSync,
}: ResolveChromiumExecutableOptions = {}) {
  const envPath = env.CHROMIUM_EXECUTABLE_PATH?.trim()
  if (envPath && exists(envPath)) return envPath

  for (const candidate of candidatePaths) {
    if (exists(candidate)) return candidate
  }

  if (executablePathFromPlaywright && exists(executablePathFromPlaywright)) {
    return executablePathFromPlaywright
  }

  throw new Error(
    'Unable to find a Chromium executable. Set CHROMIUM_EXECUTABLE_PATH to a local Chromium/Chrome binary or run pnpm exec playwright install chromium.',
  )
}
