import { describe, expect, it, vi } from 'vitest'
import {
  createProductEditorService,
  productEditSchema,
} from '../../services/productEditor'
import { getProducts, getProductWithPrice } from '../../services/products'

const product = {
  productID: 'p1',
  name: 'Draft',
  description: null,
  quantity: 1,
  weight: 1,
  visible: false,
  draft: true,
  deletedAt: null,
  salesNo: 0,
  categories: [],
  departments: [],
  productImages: [
    {
      imageID: 'i1',
      productID: 'p1',
      imageUrl: '/images/upload-1.png',
      imageOrder: 0,
    },
  ],
}

describe('product editor service', () => {
  it.each(['visible', 'draft'])(
    'derives complementary flags for %s',
    (publication) => {
      const input = productEditSchema.parse({
        name: 'Product',
        description: '',
        price: '1',
        quantity: '1',
        weight: '1',
        publication,
      })
      expect(input.visible).toBe(publication === 'visible')
      expect(input.draft).toBe(publication === 'draft')
      expect(input).not.toHaveProperty('publication')
    },
  )

  it('reads drafts from the protected admin catalogue with filters and image proxying', async () => {
    const published = {
      ...product,
      productID: 'published',
      visible: true,
      draft: false,
    }
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            product,
            published,
            { ...product, productID: 'deleted', deletedAt: '2026-11-04' },
          ],
        }),
      ),
    )
    const products = await getProducts(
      'http://backend',
      fetchFn,
      { q: 'draft & mug', category: 'c1' },
      'admin-token',
    )
    expect(products.map((item) => item.productID)).toEqual(['p1', 'published'])
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/admin/products')
    expect(url.searchParams.get('q')).toBe('draft & mug')
    expect(url.searchParams.get('category')).toBe('c1')
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer admin-token' },
      cache: 'no-store',
    })
    expect(products[0]?.productImages[0]?.imageUrl).toBe('/images/upload-1.png')
  })

  it('allows an admin to open a draft detail page and does not fall back to public reads on failure', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ product, currentPrice: null })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ price: null })))
    const draft = await getProductWithPrice(
      'p1',
      'http://backend',
      fetchFn,
      'admin-token',
    )
    expect(draft?.draft).toBe(true)
    expect(new URL(String(fetchFn.mock.calls[0]?.[0])).pathname).toBe(
      '/admin/products/p1',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer admin-token',
    })
    const denied = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
        }),
      )
    await expect(
      getProducts('http://backend', denied, {}, 'customer-token'),
    ).rejects.toThrow('HTTP 403')
    expect(denied).toHaveBeenCalledOnce()
  })

  it('excludes drafts, hidden and deleted products from customer reads', async () => {
    const published = {
      ...product,
      visible: true,
      draft: false,
      productID: 'published',
    }
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [
              product,
              published,
              { ...published, visible: false },
              { ...published, draft: true },
              { ...published, deletedAt: '2026-11-03' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ product: { ...published, draft: true } }),
        ),
      )
    expect(
      (await getProducts('http://backend', fetchFn)).map(
        (item) => item.productID,
      ),
    ).toEqual(['published'])
    expect(
      await getProductWithPrice('draft', 'http://backend', fetchFn),
    ).toBeNull()
  })
  it('authenticates admin reads, retains hidden drafts and proxies image URLs', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          product,
          currentPrice: '10.00',
          categories: [],
          departments: [],
        }),
      ),
    )
    const result = await createProductEditorService(
      'http://backend:3001',
      fetchFn,
    ).load('a/b', 'admin-token')
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://backend:3001/admin/products/a%2Fb',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer admin-token',
    })
    expect(result.product.visible).toBe(false)
    expect(result.product.productImages[0]?.imageUrl).toBe(
      '/images/upload-1.png',
    )
  })

  it('sends validated values including images in one PUT', async () => {
    const input = productEditSchema.parse({
      name: ' New name ',
      description: ' ',
      price: '1.2',
      quantity: '0',
      weight: '1.5',
      categoryIDs: 'c1',
      publication: 'visible',
      images: [{ contentType: 'image/png', data: 'aW1hZ2U=' }],
    })
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ product, currentPrice: '1.20' })),
      )
    await createProductEditorService('http://backend', fetchFn).save(
      'p1',
      'token',
      input,
    )
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify(input),
      cache: 'no-store',
    })
    expect(input).toMatchObject({
      name: 'New name',
      description: null,
      price: '1.20',
      categoryIDs: ['c1'],
      draft: false,
    })
  })

  it.each([
    { quantity: '' },
    { quantity: '1.5' },
    { quantity: '2147483648' },
    { price: '1.234' },
    { price: '100000000' },
    { weight: '' },
    { weight: 'Infinity' },
    { images: [{ contentType: 'image/svg+xml', data: 'x' }] },
  ])('rejects invalid update %j', (override) => {
    expect(
      productEditSchema.safeParse({
        name: 'Product',
        description: '',
        price: '0',
        quantity: '1',
        weight: '1',
        publication: 'visible',
        ...override,
      }).success,
    ).toBe(false)
  })

  it('does not convert backend failures into successful saves', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
      }),
    )
    await expect(
      createProductEditorService('http://backend', fetchFn).load('p1', 'token'),
    ).rejects.toMatchObject({ status: 403, message: 'Admin access required' })
  })

  it('preserves the order of mixed existing and new images and accepts removing all images', () => {
    const values = {
      name: 'Product',
      description: '',
      price: '1',
      quantity: '1',
      weight: '1',
      publication: 'visible',
    }
    const images = [
      { imageID: 'i2' },
      { contentType: 'image/png', data: 'aW1hZ2U=' },
      { imageID: 'i1' },
    ]
    expect(productEditSchema.parse({ ...values, images }).images).toEqual(
      images,
    )
    expect(productEditSchema.parse({ ...values, images: [] }).images).toEqual(
      [],
    )
    expect(productEditSchema.parse(values).images).toBeUndefined()
    expect(
      productEditSchema.safeParse({
        ...values,
        images: [{ imageID: 'i1' }, { imageID: 'i1' }],
      }).success,
    ).toBe(false)
    expect(
      productEditSchema.safeParse({
        ...values,
        images: [{ imageID: 'i1', imageUrl: '/images/other.png' }],
      }).success,
    ).toBe(false)
    expect(
      productEditSchema.safeParse({
        ...values,
        images: Array.from({ length: 6 }, (_, index) => ({
          imageID: `i${index}`,
        })),
      }).success,
    ).toBe(false)
  })
})
