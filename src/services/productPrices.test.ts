import { describe, expect, it, vi } from 'vitest'
import { getCurrentPrice } from './productPrices'

const baseUrl = 'http://localhost:3001'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('getCurrentPrice', () => {
  it('returns the current price from the backend', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        price: {
          priceID: 'price-3',
          productID: 'p1',
          price: '22.49',
          createdAt: '2026-10-03T00:00:00.000Z',
        },
      }),
    )

    await expect(getCurrentPrice('p1', baseUrl, fetchFn)).resolves.toBe('22.49')
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://localhost:3001/products/p1/prices/current',
    )
  })

  it('encodes the product ID in the URL', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ price: null }))

    await getCurrentPrice('../a b', baseUrl, fetchFn)

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://localhost:3001/products/..%2Fa%20b/prices/current',
    )
  })

  it('returns null when the product has no price', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ price: null }))

    await expect(getCurrentPrice('p1', baseUrl, fetchFn)).resolves.toBeNull()
  })

  it('returns null when the product is not found', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'Product not found' }, 404))

    await expect(getCurrentPrice('p1', baseUrl, fetchFn)).resolves.toBeNull()
  })

  it('throws on other error statuses', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({}, 500))

    await expect(getCurrentPrice('p1', baseUrl, fetchFn)).rejects.toThrow(
      'HTTP 500',
    )
  })

  it('throws when the response does not match the schema', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ price: { price: 22.49 } }))

    await expect(getCurrentPrice('p1', baseUrl, fetchFn)).rejects.toThrow(
      'did not match schema',
    )
  })
})
