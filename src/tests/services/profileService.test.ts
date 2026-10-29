import { describe, expect, it, vi } from 'vitest'
import {
  createProfileService,
  ProfileError,
} from '../../services/profileService'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('profile service', () => {
  it('reads the profile with the bearer token', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ email: 'a@b.com' }))
    const service = createProfileService(
      'http://backend:3000',
      fetchFn as typeof fetch,
    )

    expect(await service.getProfile('tok')).toEqual({ email: 'a@b.com' })

    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('http://backend:3000/profile')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    )
  })

  it('sends updates as JSON with PUT', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ email: 'a@b.com' }))
    const service = createProfileService(
      'http://backend:3000',
      fetchFn as typeof fetch,
    )
    const input = {
      firstname: 'Jane',
      surname: 'Doe',
      addressLine1: '1 High Street',
      addressLine2: '',
      postcode: 'BT7 1NT',
    }

    await service.updateProfile('tok', input)

    const [, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual(input)
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
  })

  it('reads the basket', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ items: [] }))
    const service = createProfileService(
      'http://backend:3000',
      fetchFn as typeof fetch,
    )

    expect(await service.getBasket('tok')).toEqual({ items: [] })
    expect(String((fetchFn.mock.calls[0] as unknown as [URL])[0])).toBe(
      'http://backend:3000/basket',
    )
  })

  it('reads the orders list from the backend', async () => {
    const order = {
      orderID: 'o1',
      placedAt: '2026-10-20T09:30:00.000Z',
      total: '9.00',
      items: [],
    }
    const fetchFn = vi.fn(async () => jsonResponse({ orders: [order] }))
    const service = createProfileService(
      'http://backend:3000',
      fetchFn as typeof fetch,
    )

    expect(await service.getOrders('tok')).toEqual([order])
    expect(String((fetchFn.mock.calls[0] as unknown as [URL])[0])).toBe(
      'http://backend:3000/orders',
    )
  })

  it('turns a 400 into field errors', async () => {
    const fetchFn = async () =>
      jsonResponse(
        {
          error: 'Invalid profile',
          details: { fieldErrors: { postcode: ['bad'] } },
        },
        400,
      )
    const service = createProfileService(
      'http://backend:3000',
      fetchFn as typeof fetch,
    )

    await expect(
      service.updateProfile('tok', {} as never),
    ).rejects.toMatchObject({
      status: 400,
      fieldErrors: { postcode: ['bad'] },
    })
  })

  it('reports other failures with their status', async () => {
    for (const status of [401, 404, 500]) {
      const service = createProfileService('http://backend:3000', (async () =>
        jsonResponse({ error: 'x' }, status)) as typeof fetch)

      await expect(service.getProfile('tok')).rejects.toBeInstanceOf(
        ProfileError,
      )
      await expect(service.getProfile('tok')).rejects.toMatchObject({ status })
    }
  })
})
