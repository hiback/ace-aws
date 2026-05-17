import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAccountPreferences,
  saveAccountCurrentCert,
} from '../src/lib/account-preferences-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('account preferences client', () => {
  it('fetches the account current cert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ currentCert: 'DVA-C02' }))),
    )

    await expect(fetchAccountPreferences()).resolves.toEqual({ currentCert: 'DVA-C02' })
  })

  it('normalizes invalid response certs to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ currentCert: 'SAA-C03' }))),
    )

    await expect(fetchAccountPreferences()).resolves.toEqual({ currentCert: null })
  })

  it('throws when fetching fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))

    await expect(fetchAccountPreferences()).rejects.toThrow('Failed to fetch account preferences')
  })

  it('patches the account current cert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          currentCert: 'CLF-C02',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveAccountCurrentCert('CLF-C02')).resolves.toEqual({ currentCert: 'CLF-C02' })
    expect(fetchMock).toHaveBeenCalledWith('/api/account/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentCert: 'CLF-C02' }),
    })
  })

  it('throws when patching fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))

    await expect(saveAccountCurrentCert('DVA-C02')).rejects.toThrow(
      'Failed to save account preferences',
    )
  })
})
