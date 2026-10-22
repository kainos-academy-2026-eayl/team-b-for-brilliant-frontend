import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import type { ProductWithPrice } from '../models/product'
import {
  getProductsWithPrices,
  getProductWithPrice,
} from '../services/products'

const product: ProductWithPrice = {
  productID: 'p1',
  name: '<Widget>',
  description: 'A useful widget',
  quantity: 3,
  draft: false,
  visible: true,
  weight: 1.5,
  deletedAt: null,
  categories: [],
  departments: [],
  productImages: [
    {
      imageID: 'i1',
      productID: 'p1',
      imageUrl: '/images/product-1.svg',
      imageOrder: 0,
    },
  ],
  currentPrice: '22.49',
}

async function getPage(
  fetchProducts: () => Promise<ProductWithPrice[]>,
  path = '/products',
  fetchProduct?: (productID: string) => Promise<ProductWithPrice | null>,
) {
  const server = createApp({
    fetchProducts,
    ...(fetchProduct && { fetchProduct }),
  }).listen(0)
  await once(server, 'listening')

  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port')
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`)
    return {
      status: response.status,
      html: await response.text(),
      cacheControl: response.headers.get('cache-control'),
    }
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
    expect(html).toContain('href="/products/p1"')
  })

  describe('category search', () => {
    const products: ProductWithPrice[] = [
      {
        ...product,
        productID: 'accessories',
        name: 'Matching product',
        categories: ['Accessories', 'Travel accessories'].map(
          (name, index) => ({
            categoryID: `c${index}`,
            name,
            description: null,
            departmentID: 'd1',
          }),
        ),
      },
      {
        ...product,
        productID: 'clothing',
        name: 'Different product',
        categories: [
          {
            categoryID: 'clothing',
            name: 'Clothing',
            description: null,
            departmentID: 'd1',
          },
        ],
      },
      { ...product, productID: 'uncategorised', name: 'No category' },
    ]

    it.each(['c0', 'c1'])(
      'filters by selected category ID %s and retains all options',
      async (query) => {
        const { status, html } = await getPage(
          async () => products,
          `/products?category=${encodeURIComponent(query)}`,
        )

        expect(status).toBe(200)
        expect(html.match(/href="\/products\/accessories"/g)).toHaveLength(1)
        expect(html).not.toContain('href="/products/clothing"')
        expect(html).not.toContain('href="/products/uncategorised"')
        expect(html).toContain('1 product found')
        expect(html).toMatch(new RegExp(`value="${query}" selected`))
        expect(html).toContain('>Accessories</option>')
        expect(html).toContain('>Clothing</option>')
        expect(html).toContain('>Travel accessories</option>')
        expect(html).toContain('Clear search')
      },
    )

    it.each(['/products', '/products?category=', '/products?category=%20%20'])(
      'shows all products for an empty search on %s',
      async (path) => {
        const { html } = await getPage(async () => products, path)

        for (const item of products) {
          expect(html).toContain(`href="/products/${item.productID}"`)
        }
        expect(html).not.toContain('Clear search')
      },
    )

    it('shows an explicit message for a category that is no longer available', async () => {
      const { html } = await getPage(
        async () => products,
        '/products?category=Matching',
      )

      expect(html).toContain('This category is no longer available.')
      expect(html).toContain('No products match this category.')
      expect(html).not.toContain('class="product-list"')
      expect(html).toContain('href="/products">Clear search</a>')
    })

    it('lists category options alphabetically without duplicate IDs', async () => {
      const { html } = await getPage(async () => [
        ...products,
        {
          ...product,
          productID: 'second',
          categories: products.flatMap((item) => item.categories),
        },
      ])

      expect(html.match(/<option value="c0"/g)).toHaveLength(1)
      expect(html.indexOf('>Accessories</option>')).toBeLessThan(
        html.indexOf('>Clothing</option>'),
      )
      expect(html.indexOf('>Clothing</option>')).toBeLessThan(
        html.indexOf('>Travel accessories</option>'),
      )
      expect(html).toContain(
        '<option value="" selected>All categories</option>',
      )
    })

    it('filters by ID rather than including unrelated categories with the same name', async () => {
      const { html } = await getPage(
        async () => [
          ...products,
          {
            ...product,
            productID: 'unrelated',
            categories: [
              {
                categoryID: 'different-id',
                name: 'Accessories',
                description: null,
                departmentID: 'd1',
              },
            ],
          },
        ],
        '/products?category=c0',
      )

      expect(html).toContain('href="/products/accessories"')
      expect(html).not.toContain('href="/products/unrelated"')
    })

    it('escapes category names in the dropdown and result summary', async () => {
      const { status, html } = await getPage(
        async () => [
          {
            ...product,
            categories: [
              {
                categoryID: 'escaped',
                name: '<script>alert("x")</script>',
                departmentID: 'd1',
                description: null,
              },
            ],
          },
        ],
        '/products?category=escaped',
      )

      expect(status).toBe(200)
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toContain('<script>alert')
    })

    it('rejects multiple category query values without fetching products', async () => {
      const fetchProducts = vi.fn(async () => products)
      const { status, html } = await getPage(
        fetchProducts,
        '/products?category=Accessories&category=Clothing',
      )

      expect(status).toBe(400)
      expect(html).toContain('Select a single category')
      expect(fetchProducts).not.toHaveBeenCalled()
    })
  })

  describe('GET /products/:productID', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders categories with their matching departments and escapes names', async () => {
      const { status, html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({
          ...product,
          categories: [
            {
              categoryID: 'c1',
              name: '<Accessories>',
              description: null,
              departmentID: 'd2',
            },
            {
              categoryID: 'c2',
              name: 'Clothing',
              description: 'Clothes',
              departmentID: 'd1',
            },
            {
              categoryID: 'c3',
              name: 'Homeware',
              description: null,
              departmentID: 'd2',
            },
          ],
          departments: [
            { departmentID: 'd1', name: 'Fashion', description: null },
            {
              departmentID: 'd2',
              name: '<Lifestyle>',
              description: 'Lifestyle products',
            },
          ],
        }),
      )

      expect(status).toBe(200)
      expect(html).not.toContain('<dt>Departments</dt>')
      expect(html).toContain('<h2>Categories</h2>')
      expect(html.indexOf('A useful widget')).toBeLessThan(
        html.indexOf('<h2>Categories</h2>'),
      )
      expect(html).toMatch(
        /<dt>&lt;Lifestyle&gt;<\/dt>\s*<dd>\s*<ul>\s*<li>&lt;Accessories&gt;<\/li>\s*<li>Homeware<\/li>\s*<\/ul>\s*<\/dd>/,
      )
      expect(html).toMatch(
        /<dt>Fashion<\/dt>\s*<dd>\s*<ul>\s*<li>Clothing<\/li>/,
      )
      expect(html.match(/&lt;Lifestyle&gt;/g)).toHaveLength(1)
      expect(html.match(/Fashion/g)).toHaveLength(1)
      expect(html).not.toContain('<Accessories>')
      expect(html).not.toContain('<Lifestyle>')
    })

    it('omits classification markup when the product has no categories or departments', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => product,
      )

      expect(html).not.toContain('<h2>Categories</h2>')
      expect(html).not.toContain('<dt>Departments</dt>')
    })

    it('keeps categories visible when the department is missing', async () => {
      const { status, html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({
          ...product,
          categories: [
            {
              categoryID: 'c1',
              name: 'Accessories',
              description: null,
              departmentID: 'missing',
            },
          ],
        }),
      )

      expect(status).toBe(200)
      expect(html).toContain('<dt>Other categories</dt>')
      expect(html).toContain('<li>Accessories</li>')
    })

    it('renders fresh data for each selected product using the same template', async () => {
      const fetchProducts = vi.fn(async () => [product])
      const fetchProduct = vi.fn(async (productID: string) => ({
        ...product,
        productID,
        name: productID === 'p1' ? '<Fresh widget>' : 'Second widget',
      }))

      const first = await getPage(fetchProducts, '/products/p1', fetchProduct)
      const second = await getPage(fetchProducts, '/products/p2', fetchProduct)

      expect(first.status).toBe(200)
      expect(first.cacheControl).toBe('no-store')
      expect(first.html).toContain('&lt;Fresh widget&gt;')
      expect(first.html).toContain('A useful widget')
      expect(first.html).toContain('£22.49')
      expect(first.html).toContain('src="/images/product-1.svg"')
      expect(first.html).toContain('href="/products"')
      expect(first.html).not.toContain('Weight')
      expect(second.html).toContain('Second widget')
      expect(fetchProduct.mock.calls).toEqual([['p1'], ['p2']])
      expect(fetchProducts).not.toHaveBeenCalled()
    })

    it('renders image and price fallbacks and out-of-stock status', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({
          ...product,
          productImages: [],
          currentPrice: null,
          description: null,
          quantity: 0,
        }),
      )
      expect(html).toContain('No image available')
      expect(html).toContain('Price unavailable')
      expect(html).toContain('Out of stock')
      expect(html).not.toContain('<h2>Description</h2>')
      expect(html).not.toContain('class="product-detail__thumbnail"')
      expect(html).not.toContain('product-gallery.js')
    })

    it('shows stock-limited quantity choices and a UI-only basket button between price and description', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => product,
      )

      expect(html).toContain('<label for="product-quantity">Quantity</label>')
      expect(html).toContain('<select id="product-quantity" name="quantity">')
      expect(html.match(/<option value="\d+">\d+<\/option>/g)).toEqual([
        '<option value="1">1</option>',
        '<option value="2">2</option>',
        '<option value="3">3</option>',
      ])
      expect(html).toContain(
        '<button type="button" class="button">Add to basket</button>',
      )
      expect(html.indexOf('£22.49')).toBeLessThan(
        html.indexOf('id="product-quantity"'),
      )
      expect(html.indexOf('id="product-quantity"')).toBeLessThan(
        html.indexOf('Add to basket'),
      )
      expect(html.indexOf('Add to basket')).toBeLessThan(
        html.indexOf('<h2>Description</h2>'),
      )
    })

    it('caps quantity choices at 10 when stock is higher', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({ ...product, quantity: 50 }),
      )

      const values = html.match(/<option value="\d+">/g) ?? []
      expect(values).toHaveLength(10)
      expect(html).toContain('<option value="10">10</option>')
      expect(html).not.toContain('<option value="11">')
    })

    it.each([0, -1])(
      'disables basket controls when stock is %s',
      async (quantity) => {
        const { html } = await getPage(
          async () => [],
          '/products/p1',
          async () => ({ ...product, quantity }),
        )

        expect(html).toContain(
          '<select id="product-quantity" name="quantity" disabled>',
        )
        expect(html).toContain('<option value="0">0</option>')
        expect(html).toContain(
          '<button type="button" class="button" disabled>Add to basket</button>',
        )
        expect(html).not.toContain('<option value="1">')
      },
    )

    it('renders a single main image without thumbnail controls for one image', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => product,
      )

      expect(html).toContain(
        'id="product-main-image" src="/images/product-1.svg"',
      )
      expect(html.match(/<img /g)).toHaveLength(1)
      expect(html).not.toContain('class="product-detail__thumbnail"')
      expect(html).not.toContain('product-gallery.js')
    })

    it('renders every thumbnail beside an initially selected first image', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({
          ...product,
          productImages: [
            ...product.productImages,
            {
              imageID: 'i2',
              productID: 'p1',
              imageUrl: '/images/product-2.svg',
              imageOrder: 1,
            },
            {
              imageID: 'i3',
              productID: 'p1',
              imageUrl: '/images/product-3.svg',
              imageOrder: 2,
            },
          ],
        }),
      )

      expect(html).toContain('product-detail__images--gallery')
      expect(html).toContain(
        'id="product-main-image" src="/images/product-1.svg"',
      )
      expect(html.match(/class="product-detail__thumbnail"/g)).toHaveLength(3)
      expect(html.match(/\saria-pressed="true"/g)).toHaveLength(1)
      expect(html.match(/\saria-pressed="false"/g)).toHaveLength(2)
      for (let index = 1; index <= 3; index++) {
        expect(html).toContain(`data-image-src="/images/product-${index}.svg"`)
        expect(html).toContain(`View image ${index} of 3 for &lt;Widget&gt;`)
      }
      expect(html).toContain('src="/static/product-gallery.js"')
    })

    it('returns a useful 404 when the product cannot be shown', async () => {
      const { status, html } = await getPage(
        async () => [],
        '/products/missing',
        async () => null,
      )
      expect(status).toBe(404)
      expect(html).toContain('Product not found')
      expect(html).toContain('href="/products"')
    })

    it('returns 502 without leaking backend errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { status, html } = await getPage(
        async () => [],
        '/products/p1',
        async () => {
          throw new Error('connect ECONNREFUSED')
        },
      )
      expect(status).toBe(502)
      expect(html).toContain('We could not load this product right now.')
      expect(html).not.toContain('ECONNREFUSED')
    })
  })

  it('renders a placeholder when a product has no current price', async () => {
    const { html } = await getPage(async () => [
      { ...product, currentPrice: null },
    ])

    expect(html).toContain('Price unavailable')
  })

  it.each([0, 2])(
    'uses the lowest imageOrder (%s) for the catalogue and initial main image',
    async (lowestOrder) => {
      const unorderedProduct = {
        ...product,
        productImages: [10, lowestOrder, 3].map((imageOrder) => ({
          imageID: `i${imageOrder}`,
          productID: 'p1',
          imageUrl: `/images/order-${imageOrder}.svg`,
          imageOrder,
        })),
      }
      const fetchFn = vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname
        const body = path.endsWith('/prices/current')
          ? { price: null }
          : path === '/products'
            ? { products: [unorderedProduct] }
            : { product: unorderedProduct }
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        })
      })
      const fetchProducts = () =>
        getProductsWithPrices('http://localhost:3001', fetchFn)
      const fetchProduct = (id: string) =>
        getProductWithPrice(id, 'http://localhost:3001', fetchFn)

      const catalogue = await getPage(fetchProducts)
      const detail = await getPage(fetchProducts, '/products/p1', fetchProduct)

      expect(catalogue.status).toBe(200)
      expect(catalogue.html).toContain(`src="/images/order-${lowestOrder}.svg"`)
      expect(catalogue.html).not.toContain('src="/images/order-10.svg"')
      expect(detail.status).toBe(200)
      expect(detail.html).toContain(
        `id="product-main-image" src="/images/order-${lowestOrder}.svg"`,
      )
      const thumbnails = [...detail.html.matchAll(/data-image-src="([^"]+)"/g)]
      expect(thumbnails.map((match) => match[1])).toEqual([
        `/images/order-${lowestOrder}.svg`,
        '/images/order-3.svg',
        '/images/order-10.svg',
      ])
    },
  )

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
