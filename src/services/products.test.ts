import { describe, expect, it, vi } from 'vitest'
import { getProducts, getProductsWithPrices } from './products'

const backendProduct = {
  productID: 'p1',
  name: 'Widget',
  description: null,
  quantity: 3,
  draft: false,
  visible: true,
  weight: 1.5,
  deletedAt: null,
  productImages: [
    { imageID: 'i1', productID: 'p1', imageUrl: '/images/product-1.svg' },
  ],
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('getProducts', () => {
  it('fetches products from the backend and rewrites image URLs to the frontend proxy', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ products: [backendProduct] }))

    const products = await getProducts('http://localhost:3001', fetchFn)

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://localhost:3001/products',
    )
    expect(products).toEqual([
      {
        ...backendProduct,
        productImages: [
          {
            ...backendProduct.productImages[0],
            imageUrl: '/images/product-1.svg',
          },
        ],
      },
    ])
  })

  it('only returns products that are visible', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        products: [
          backendProduct,
          { ...backendProduct, productID: 'p2', visible: false },
        ],
      }),
    )

    const products = await getProducts('http://localhost:3001', fetchFn)

    expect(products.map((product) => product.productID)).toEqual(['p1'])
  })

  it('throws when the backend responds with an error status', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({}, 500))

    await expect(getProducts('http://localhost:3001', fetchFn)).rejects.toThrow(
      'HTTP 500',
    )
  })

  it('throws when the backend response does not match the schema', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ products: [{ name: 'Widget' }] }))

    await expect(getProducts('http://localhost:3001', fetchFn)).rejects.toThrow(
      'did not match schema',
    )
  })
})

describe('getProductsWithPrices', () => {
  it('attaches the current price to each visible product', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/products')) {
        return jsonResponse({
          products: [
            backendProduct,
            { ...backendProduct, productID: 'p2', visible: false },
          ],
        })
      }
      return jsonResponse({
        price: {
          priceID: 'price-1',
          productID: 'p1',
          price: '22.49',
          createdAt: '2026-10-03T00:00:00.000Z',
        },
      })
    })

    const products = await getProductsWithPrices(
      'http://localhost:3001',
      fetchFn,
    )

    expect(products).toHaveLength(1)
    expect(products[0]?.currentPrice).toBe('22.49')
    expect(fetchFn.mock.calls.map(([input]) => String(input))).toEqual([
      'http://localhost:3001/products',
      'http://localhost:3001/products/p1/prices/current',
    ])
  })

  it('still returns the product when its price request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/products')
        ? jsonResponse({ products: [backendProduct] })
        : jsonResponse({}, 500),
    )

    const products = await getProductsWithPrices(
      'http://localhost:3001',
      fetchFn,
    )

    expect(products).toHaveLength(1)
    expect(products[0]?.currentPrice).toBeNull()
    vi.restoreAllMocks()
  })
})
