import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'

describe('next config', () => {
  it('allows GitHub avatar images used by signed-in account UI', () => {
    expect(nextConfig.images?.remotePatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocol: 'https',
          hostname: 'avatars.githubusercontent.com',
          pathname: '/u/**',
        }),
      ]),
    )
  })
})
