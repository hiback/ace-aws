import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { resolveScreenshotServer } from '../scripts/readme-screenshots/server'

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  killedSignals: NodeJS.Signals[] = []

  kill(signal?: NodeJS.Signals | number) {
    if (typeof signal === 'string') {
      this.killedSignals.push(signal)
    }
    queueMicrotask(() => this.emit('exit', null, signal ?? null))
    return true
  }
}

describe('resolveScreenshotServer', () => {
  it('uses README_SCREENSHOT_BASE_URL without starting a local service', async () => {
    const server = await resolveScreenshotServer({
      README_SCREENSHOT_BASE_URL: 'http://127.0.0.1:4444/',
    })

    expect(server.baseUrl).toBe('http://127.0.0.1:4444')
    await expect(server.stop()).resolves.toBeUndefined()
  })

  it('stops the spawned local service when startup fails', async () => {
    const child = new FakeChildProcess()

    await expect(
      resolveScreenshotServer(
        { README_SCREENSHOT_PORT: '3199' },
        {
          spawnProcess: () => child as unknown as ChildProcess,
          startupTimeoutMs: -1,
        },
      ),
    ).rejects.toThrow('Timed out waiting for Next.js dev server at http://127.0.0.1:3199.')

    expect(child.killedSignals).toEqual(['SIGTERM'])
  })
})
