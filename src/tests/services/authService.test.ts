import { describe, expect, it, vi } from 'vitest'
import type { VerifyResult } from '../../clients/accountClient'
import { createLoginThrottle } from '../../middleware/loginThrottle'
import { createAuthService } from '../../services/authService'

const makeClient = (result: VerifyResult) => ({
  verifyCredentials: vi.fn().mockResolvedValue(result),
  verifyMfa: vi.fn(),
  uniqueEmail: vi.fn(),
  register: vi.fn(),
})

describe('authService.login', () => {
  it('returns success for valid credentials', async () => {
    const service = createAuthService(
      makeClient({ status: 'valid', customerId: 'c1', mfaEnabled: false }),
      createLoginThrottle(),
    )
    expect(await service.login('a@b.com', 'pw', '1.1.1.1')).toEqual({
      status: 'success',
      customerId: 'c1',
    })
  })

  it('returns invalid for bad credentials', async () => {
    const service = createAuthService(
      makeClient({ status: 'invalid' }),
      createLoginThrottle(),
    )
    expect(await service.login('a@b.com', 'bad', '1.1.1.1')).toEqual({
      status: 'invalid',
    })
  })

  it('locks after 5 consecutive failures without calling the account service', async () => {
    const client = makeClient({ status: 'invalid' })
    const service = createAuthService(client, createLoginThrottle())

    for (let i = 0; i < 5; i++) await service.login('a@b.com', 'bad', '1.1.1.1')
    const result = await service.login('a@b.com', 'bad', '1.1.1.1')

    expect(result).toEqual({ status: 'locked' })
    expect(client.verifyCredentials).toHaveBeenCalledTimes(5)
  })

  it('returns error when the account service fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      verifyCredentials: vi.fn().mockRejectedValue(new Error('down')),
      verifyMfa: vi.fn(),
      uniqueEmail: vi.fn(),
      register: vi.fn(),
    }
    const service = createAuthService(client, createLoginThrottle())
    expect(await service.login('a@b.com', 'pw', '1.1.1.1')).toEqual({
      status: 'error',
    })
  })
})
