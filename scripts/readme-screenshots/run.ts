import { captureReadmeScreenshots } from './capture'
import { resolveScreenshotServer } from './server'

async function main() {
  const server = await resolveScreenshotServer()

  try {
    await captureReadmeScreenshots({ baseUrl: server.baseUrl })
  } finally {
    await server.stop()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
