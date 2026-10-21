import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import type { ProductWithPrice } from '../models/product'

const product: ProductWithPrice = {
  productID: 'p1',
  name: '<Widget>',
  description: 'A useful widget',
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
    },
  ],
  currentPrice: '22.49',
}

async function getPage(fetchProducts: () => Promise<ProductWithPrice[]>) {
  const server = createApp(fetchProducts).listen(0)
  await once(server, 'listening')

  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port')
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/products`)
    return { status: response.status, html: await response.text() }
  } finally {
    server.close()
    await once(server, 'close')
  }
}

describe('GET /products', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders products and their current price instead of the description', async () => {
    const { status, html } = await getPage(async () => [product])

    expect(status).toBe(200)
    expect(html).toContain('&lt;Widget&gt;')
    expect(html).toContain('£22.49')
    expect(html).not.toContain('A useful widget')
    expect(html).not.toContain('Quantity')
    expect(html).not.toContain('Weight')
    expect(html).toContain('src="/images/product-1.svg"')
    expect(html).not.toContain('localhost:3001')
  })

  it('renders a placeholder when a product has no current price', async () => {
    const { html } = await getPage(async () => [
      { ...product, currentPrice: null },
    ])

    expect(html).toContain('Price unavailable')
  })

  it('renders an empty state when there are no products', async () => {
    const { status, html } = await getPage(async () => [])

    expect(status).toBe(200)
    expect(html).toContain('No products available.')
  })

  it('renders an error page when the backend is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { status, html } = await getPage(async () => {
      throw new Error('connect ECONNREFUSED')
    })

    expect(status).toBe(502)
    expect(html).toContain('We could not load products right now.')
    expect(html).not.toContain('ECONNREFUSED')
  })
})
