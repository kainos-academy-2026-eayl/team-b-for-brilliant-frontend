import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRICE_FETCH_CONCURRENCY,
  getPriceFetchConcurrency,
  getProducts,
  getProductsWithPrices,
  getProductWithPrice,
} from './products'

const backendProduct = {
  productID: 'p1',
  salesNo: 10,
  name: 'Widget',
  description: null,
  quantity: 3,
  draft: false,
  visible: true,
  weight: 1.5,
  deletedAt: null,
  productImages: [
    {
      imageID: 'i1',
      productID: 'p1',
      imageUrl: '/images/product-1.svg',
      imageOrder: 0,
    },
  ],
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('product sales totals', () => {
  it('preserves salesNo from the backend when attaching current prices', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/prices/current')
        ? jsonResponse({ price: null })
        : jsonResponse({ products: [backendProduct] }),
    )
    const products = await getProductsWithPrices(
      'http://localhost:3001',
      fetchFn,
    )

    expect(products[0]?.salesNo).toBe(10)
  })

  it.each([undefined, null, '10', -1, 1.5])(
    'rejects missing or invalid salesNo %s rather than inventing a ranking',
    async (salesNo) => {
      const fetchFn = vi.fn<typeof fetch>(async () =>
        jsonResponse({ products: [{ ...backendProduct, salesNo }] }),
      )
      await expect(
        getProducts('http://localhost:3001', fetchFn),
      ).rejects.toThrow('did not match schema')
    },
  )
})

describe.each(['catalogue', 'detail'] as const)('%s image ordering', (page) => {
  const loadProducts = async (images: object[]) => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/prices/current')
        ? jsonResponse({ price: null })
        : jsonResponse(
            page === 'catalogue'
              ? { products: [{ ...backendProduct, productImages: images }] }
              : { product: { ...backendProduct, productImages: images } },
          ),
    )
    if (page === 'catalogue') {
      return getProducts('http://localhost:3001', fetchFn)
    }
    return [await getProductWithPrice('p1', 'http://localhost:3001', fetchFn)]
  }

  it('sorts images numerically without mutating the source array', async () => {
    const images = [10, 0, 2].map((imageOrder) => ({
      imageID: `i${imageOrder}`,
      productID: 'p1',
      imageUrl: `http://localhost:3001/images/order-${imageOrder}.svg`,
      imageOrder,
    }))
    const products = await loadProducts(images)

    expect(products[0]?.productImages.map((image) => image.imageOrder)).toEqual(
      [0, 2, 10],
    )
    expect(products[0]?.productImages[0]?.imageUrl).toBe('/images/order-0.svg')
    expect(images.map((image) => image.imageOrder)).toEqual([10, 0, 2])
  })

  it.each([undefined, null, '0', 0.5, -1])(
    'rejects invalid imageOrder %s',
    async (imageOrder) => {
      await expect(
        loadProducts([
          {
            imageID: 'i1',
            productID: 'p1',
            imageUrl: '/images/product-1.svg',
            imageOrder,
          },
        ]),
      ).rejects.toThrow('did not match schema')
    },
  )
})

describe('getProductWithPrice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests just the selected product and price again on every call', async () => {
    let revision = 0
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/prices/current')
        ? jsonResponse({ price: null })
        : jsonResponse({
            product: {
              ...backendProduct,
              name: `Revision ${++revision}`,
              productImages: [
                {
                  imageID: 'i1',
                  productID: 'p1',
                  imageUrl: 'http://localhost:3001/images/product-1.svg',
                  imageOrder: 0,
                },
              ],
            },
          }),
    )
    const first = await getProductWithPrice(
      'p1',
      'http://localhost:3001',
      fetchFn,
    )
    const second = await getProductWithPrice(
      'p1',
      'http://localhost:3001',
      fetchFn,
    )
    expect(first?.name).toBe('Revision 1')
    expect(second?.name).toBe('Revision 2')
    expect(first?.productImages[0]?.imageUrl).toBe('/images/product-1.svg')
    expect(fetchFn.mock.calls.map(([input]) => String(input))).toEqual([
      'http://localhost:3001/products/p1',
      'http://localhost:3001/products/p1/prices/current',
      'http://localhost:3001/products/p1',
      'http://localhost:3001/products/p1/prices/current',
    ])
  })

  it('encodes product IDs and attaches the current price', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ product: backendProduct }))
      .mockResolvedValueOnce(
        jsonResponse({
          price: {
            priceID: 'price-1',
            productID: 'p1',
            price: '22.49',
            createdAt: '2026-10-03T00:00:00.000Z',
          },
        }),
      )
    const result = await getProductWithPrice(
      'p/1?',
      'http://localhost:3001',
      fetchFn,
    )
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://localhost:3001/products/p%2F1%3F',
    )
    expect(result?.currentPrice).toBe('22.49')
  })

  it.each([404, 200])(
    'returns null for a missing or hidden product (HTTP %s)',
    async (status) => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            { product: { ...backendProduct, visible: false } },
            status,
          ),
        )
      expect(
        await getProductWithPrice('p1', 'http://localhost:3001', fetchFn),
      ).toBeNull()
      expect(fetchFn).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects a failed product request', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({}, 500))
    await expect(
      getProductWithPrice('p1', 'http://localhost:3001', fetchFn),
    ).rejects.toThrow('HTTP 500')
  })

  it('rejects malformed product data', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ product: { name: 'Widget' } }))
    await expect(
      getProductWithPrice('p1', 'http://localhost:3001', fetchFn),
    ).rejects.toThrow('did not match schema')
  })

  it('logs price failures and still returns the product', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ product: backendProduct }))
      .mockRejectedValueOnce(new Error('Price unavailable'))
    const result = await getProductWithPrice(
      'p1',
      'http://localhost:3001',
      fetchFn,
    )
    expect(result?.productID).toBe('p1')
    expect(result?.currentPrice).toBeNull()
    expect(log).toHaveBeenCalledOnce()
  })
})

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

describe('getProductsWithPrices concurrency', () => {
  it('limits simultaneous price requests and keeps per-product fallbacks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`)
    let activePriceRequests = 0
    let peakPriceRequests = 0

    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/products')) {
        return jsonResponse({
          products: ids.map((productID) => ({
            ...backendProduct,
            productID,
            productImages: [],
          })),
        })
      }

      activePriceRequests++
      peakPriceRequests = Math.max(peakPriceRequests, activePriceRequests)
      await new Promise((resolve) => setTimeout(resolve, 2))
      activePriceRequests--

      const productID = url.split('/')[4] ?? ''
      if (productID === 'p3') {
        return jsonResponse({}, 500)
      }
      return jsonResponse({
        price: {
          priceID: `price-${productID}`,
          productID,
          price: `${productID.slice(1)}.00`,
          createdAt: '2026-10-03T00:00:00.000Z',
        },
      })
    })

    const products = await getProductsWithPrices(
      'http://localhost:3001',
      fetchFn,
      4,
    )

    expect(peakPriceRequests).toBe(4)
    expect(fetchFn).toHaveBeenCalledTimes(13)
    expect(products.map((product) => product.productID)).toEqual(ids)
    expect(products[3]?.currentPrice).toBeNull()
    expect(products[11]?.currentPrice).toBe('11.00')
    vi.restoreAllMocks()
  })
})

describe('getPriceFetchConcurrency', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults when PRICE_FETCH_CONCURRENCY is not set', () => {
    vi.stubEnv('PRICE_FETCH_CONCURRENCY', '')
    expect(getPriceFetchConcurrency()).toBe(DEFAULT_PRICE_FETCH_CONCURRENCY)
  })

  it('reads PRICE_FETCH_CONCURRENCY', () => {
    vi.stubEnv('PRICE_FETCH_CONCURRENCY', '10')
    expect(getPriceFetchConcurrency()).toBe(10)
  })

  it.each(['0', '-2', '2.5', 'abc'])('rejects %s', (value) => {
    vi.stubEnv('PRICE_FETCH_CONCURRENCY', value)
    expect(() => getPriceFetchConcurrency()).toThrow(
      'Invalid PRICE_FETCH_CONCURRENCY',
    )
  })
})
