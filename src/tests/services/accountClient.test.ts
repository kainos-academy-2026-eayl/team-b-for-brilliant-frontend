import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAccountClient } from '../../clients/accountClient'

afterEach(() => vi.unstubAllGlobals())

describe('account client without MFA', () => {
  it('accepts a credentials response containing only customerId', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ customerId: 'user-1' }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetch)
    const result = await createAccountClient(
      'http://backend.test',
    ).verifyCredentials('user@example.com', 'password123')
    expect(result).toEqual({ status: 'valid', customerId: 'user-1' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'http://backend.test/auth/verify',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it.each([
    [401, 'invalid'],
    [404, 'not_found'],
  ])('preserves HTTP %s credential handling', async (status, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: Number(status) })),
    )
    expect(
      await createAccountClient('http://backend.test').verifyCredentials(
        'user@example.com',
        'password123',
      ),
    ).toEqual({ status: expected })
  })

  it('propagates backend failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    )
    await expect(
      createAccountClient('http://backend.test').verifyCredentials(
        'user@example.com',
        'password123',
      ),
    ).rejects.toThrow('Account service responded 500')
  })
})
