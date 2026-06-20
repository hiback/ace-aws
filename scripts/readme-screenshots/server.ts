import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process'

export interface ScreenshotServer {
  baseUrl: string
  stop: () => Promise<void>
}

type SpawnServerProcess = (command: string, args: string[], options: SpawnOptions) => ChildProcess

interface ScreenshotServerOptions {
  spawnProcess?: SpawnServerProcess
  startupTimeoutMs?: number
  pollIntervalMs?: number
  fetchServer?: typeof fetch
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3107
const STARTUP_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 500

export async function resolveScreenshotServer(
  env: NodeJS.ProcessEnv = process.env,
  options: ScreenshotServerOptions = {},
) {
  const configuredBaseUrl = env.README_SCREENSHOT_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return {
      baseUrl: configuredBaseUrl.replace(/\/$/, ''),
      stop: async () => {},
    }
  }

  const port = Number(env.README_SCREENSHOT_PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('README_SCREENSHOT_PORT must be a positive integer when provided.')
  }

  const baseUrl = `http://${DEFAULT_HOST}:${port}`
  const spawnProcess = options.spawnProcess ?? spawn
  const child = spawnProcess(
    'pnpm',
    ['exec', 'next', 'dev', '--turbopack', '--hostname', DEFAULT_HOST, '--port', String(port)],
    {
      stdio: 'inherit',
      env: {
        ...env,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  )

  try {
    await waitForServer(baseUrl, child, {
      fetchServer: options.fetchServer ?? fetch,
      pollIntervalMs: options.pollIntervalMs ?? POLL_INTERVAL_MS,
      startupTimeoutMs: options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS,
    })
  } catch (error) {
    await stopServer(child)
    throw error
  }

  return {
    baseUrl,
    stop: () => stopServer(child),
  }
}

async function waitForServer(
  baseUrl: string,
  child: ChildProcess,
  options: {
    fetchServer: typeof fetch
    pollIntervalMs: number
    startupTimeoutMs: number
  },
) {
  const deadline = Date.now() + options.startupTimeoutMs

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js dev server exited early with code ${child.exitCode}.`)
    }

    try {
      const response = await options.fetchServer(baseUrl, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {
      await delay(options.pollIntervalMs)
    }
  }

  throw new Error(`Timed out waiting for Next.js dev server at ${baseUrl}.`)
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    child.kill('SIGTERM')
  })
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
