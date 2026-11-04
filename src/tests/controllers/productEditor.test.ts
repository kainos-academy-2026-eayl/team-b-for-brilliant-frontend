import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'
import type { ProductWithPrice } from '../../models/product'
import type { ProductFilters } from '../../services/products'
import {
  ProductEditorError,
  type ProductEditorService,
} from '../../services/productEditor'

const product: ProductWithPrice = {
  productID: 'p1',
  name: 'Example',
  description: 'Details',
  quantity: 7,
  weight: 1.5,
  draft: false,
  visible: true,
  deletedAt: null,
  salesNo: 0,
  categories: [],
  departments: [],
  productImages: [],
  currentPrice: '12.50',
}
const form = {
  name: 'Updated',
  description: 'New details',
  quantity: '4',
  weight: '2',
  price: '20.99',
  publication: 'visible',
  categoryIDs: ['c1'],
}

function token(html: string) {
  const value = /name="_csrf" value="([^"]+)"/.exec(html)?.[1]
  if (!value) throw new Error('Missing CSRF token')
  return value
}

function setup(products: ProductWithPrice[] = [product]) {
  const service: ProductEditorService = {
    load: vi.fn(async () => ({
      product,
      currentPrice: product.currentPrice,
      categories: [],
      departments: [],
    })),
    save: vi.fn(async () => ({ product, currentPrice: '20.99' })),
  }
  const fetchProducts = vi.fn(
    async (filters?: ProductFilters, adminToken?: string) =>
      products.filter(
        (item) =>
          item.deletedAt === null &&
          (Boolean(adminToken) || (item.visible && !item.draft)) &&
          (!filters?.q ||
            item.name.toLowerCase().includes(filters.q.toLowerCase())) &&
          (!filters?.category ||
            item.categories.some(
              (category) => category.categoryID === filters.category,
            )),
      ),
  )
  const fetchProduct = vi.fn(
    async (productID: string, adminToken?: string) =>
      products.find(
        (item) =>
          item.productID === productID &&
          item.deletedAt === null &&
          (Boolean(adminToken) || (item.visible && !item.draft)),
      ) ?? null,
  )
  const app = createTestApp({
    productEditorService: service,
    fetchProducts,
    fetchProduct,
    adminAuthService: {
      login: async () => ({ status: 'success', accessToken: 'admin-token' }),
    },
  })
  const agent = request.agent(app)
  async function signIn() {
    const login = await agent.get('/admin/login')
    await agent
      .post('/admin/login')
      .type('form')
      .send({
        _csrf: token(login.text),
        email: 'admin@b-brilliant.com',
        password: 'correct',
      })
      .expect(302)
  }
  return { app, agent, service, signIn, fetchProducts, fetchProduct }
}

describe('admin product editing', () => {
  it('keeps customer catalog links read-only and redirects non-admin editor access', async () => {
    const { app, service } = setup()
    const catalog = await request(app).get('/products').expect(200)
    expect(catalog.text).toContain('href="/products/p1"')
    expect(catalog.text).not.toContain('href="/products/p1/edit"')
    const detail = await request(app).get('/products/p1').expect(200)
    expect(detail.text).not.toContain('href="/products/p1/edit"')
    const editor = await request(app).get('/products/p1/edit').expect(302)
    expect(editor.headers.location).toBe(
      '/admin/login?next=%2Fproducts%2Fp1%2Fedit',
    )
    expect(service.load).not.toHaveBeenCalled()
  })

  it('shares the customer catalog and detail page, offers admin editing and persists a JSON save', async () => {
    const { app, agent, service, signIn, fetchProducts, fetchProduct } = setup()
    const customerCatalog = await request(app)
      .get('/products?q=Example')
      .expect(200)
    await signIn()
    const catalog = await agent.get('/products?q=Example').expect(200)
    expect(catalog.text).toContain('href="/products/p1"')
    expect(catalog.text).not.toContain('href="/products/p1/edit"')
    expect(
      catalog.text.match(/<ul class="product-list">[\s\S]*?<\/ul>/)?.[0],
    ).toBe(
      customerCatalog.text.match(
        /<ul class="product-list">[\s\S]*?<\/ul>/,
      )?.[0],
    )
    expect(fetchProducts.mock.calls).toEqual([
      [{ q: 'Example' }],
      [],
      [{ q: 'Example' }, 'admin-token'],
      [undefined, 'admin-token'],
    ])
    expect(service.load).not.toHaveBeenCalled()
    const detail = await agent.get('/products/p1').expect(200)
    expect(fetchProduct).toHaveBeenCalledWith('p1', 'admin-token')
    expect(detail.text).toContain('<h1>Example</h1>')
    expect(detail.text).toContain(
      '<a href="/products/p1/edit">Edit product</a>',
    )
    expect(detail.text).not.toContain('id="product-edit-form"')
    expect(service.load).not.toHaveBeenCalled()
    const editLink = /<a href="([^"]+)">Edit product<\/a>/.exec(
      detail.text,
    )?.[1]
    expect(editLink).toBe('/products/p1/edit')
    if (!editLink) throw new Error('Missing product edit link')
    const editor = await agent.get(editLink).expect(200)
    expect(editor.text).toContain('value="12.50"')
    expect(service.load).toHaveBeenCalledWith('p1', 'admin-token')
    const saved = await agent
      .post('/products/p1/edit')
      .send({
        ...form,
        _csrf: token(editor.text),
        images: [{ contentType: 'image/png', data: 'aW1hZ2U=' }],
      })
      .expect(200)
    expect(saved.body).toEqual({ redirect: '/products/p1/edit?saved=1' })
    expect(service.save).toHaveBeenCalledWith('p1', 'admin-token', {
      name: 'Updated',
      description: 'New details',
      quantity: 4,
      weight: 2,
      price: '20.99',
      visible: true,
      draft: false,
      categoryIDs: ['c1'],
      images: [{ contentType: 'image/png', data: 'aW1hZ2U=' }],
    })
    const confirmation = await agent.get(saved.body.redirect).expect(200)
    expect(confirmation.text).toContain('Product changes saved.')
    expect(confirmation.headers['cache-control']).toBe('no-store')
  })

  it('shows labelled drafts and draft-only categories to admins, but not customers', async () => {
    const category = {
      categoryID: 'draft-category',
      name: 'Draft category',
      description: null,
      departmentID: 'd1',
    }
    const draft = {
      ...product,
      productID: 'draft-1',
      name: 'Draft example',
      visible: false,
      draft: true,
      categories: [category],
    }
    const deleted = {
      ...draft,
      productID: 'deleted-1',
      name: 'Deleted example',
      deletedAt: '2026-11-04',
    }
    const { app, agent, service, signIn, fetchProducts, fetchProduct } = setup([
      product,
      draft,
      deleted,
    ])
    const customer = await request(app)
      .get('/products?admin=true&includeDrafts=true')
      .expect(200)
    expect(customer.text).not.toContain('href="/products/draft-1"')
    expect(customer.text).not.toContain('Draft category')
    await request(app).get('/products/draft-1').expect(404)
    await signIn()
    const catalog = await agent.get('/products').expect(200)
    expect(catalog.text).toContain('href="/products/draft-1"')
    expect(catalog.text).toContain('<span class="product__draft">Draft</span>')
    expect(catalog.text).toContain('Draft category')
    expect(catalog.text).not.toContain('href="/products/deleted-1"')
    const filtered = await agent
      .get('/products?q=draft&category=draft-category')
      .expect(200)
    expect(filtered.text).toContain('1 product found')
    expect(fetchProducts).toHaveBeenCalledWith(
      { q: 'draft', category: 'draft-category' },
      'admin-token',
    )
    expect(fetchProducts).toHaveBeenLastCalledWith(undefined, 'admin-token')
    const detail = await agent.get('/products/draft-1').expect(200)
    expect(detail.text).toContain('Draft - visible only to admins')
    expect(detail.text).toContain(
      '<a href="/products/draft-1/edit">Edit product</a>',
    )
    expect(fetchProduct).toHaveBeenLastCalledWith('draft-1', 'admin-token')
    vi.mocked(service.load).mockResolvedValueOnce({
      product: draft,
      currentPrice: draft.currentPrice,
      categories: [category],
      departments: [],
    })
    const edit = await agent.get('/products/draft-1/edit').expect(200)
    expect(edit.text).toMatch(/id="edit-product-draft"[^>]*checked/)
    expect(service.load).toHaveBeenLastCalledWith('draft-1', 'admin-token')
  })

  it('never enables draft reads for a signed-in customer', async () => {
    const draft = {
      ...product,
      productID: 'draft-1',
      name: 'Customer-hidden draft',
      visible: false,
      draft: true,
    }
    const fetchProducts = vi.fn(
      async (_filters?: ProductFilters, adminToken?: string) =>
        adminToken ? [product, draft] : [product],
    )
    const fetchProduct = vi.fn(
      async (_productID: string, adminToken?: string) =>
        adminToken ? draft : null,
    )
    const app = createTestApp({
      fetchProducts,
      fetchProduct,
      tokenClient: {
        getIdentity: async () => ({ customerId: 'customer-1', accessLevel: 0 }),
        logout: async () => {},
      },
    })
    const response = await request(app)
      .get('/products?includeDrafts=true')
      .set('Cookie', 'access_token=customer-token')
      .expect(200)
    expect(response.text).not.toContain('href="/products/draft-1"')
    expect(fetchProducts).toHaveBeenCalledExactlyOnceWith({})
    await request(app)
      .get('/products/draft-1')
      .set('Cookie', 'access_token=customer-token')
      .expect(404)
    expect(fetchProduct).toHaveBeenCalledExactlyOnceWith('draft-1')
  })

  it('requires one publication choice and derives exclusive flags for both form and JSON saves', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    const editor = await agent.get('/products/p1/edit')
    const csrf = token(editor.text)
    for (const publication of [undefined, ['visible', 'draft'], 'invalid']) {
      const response = await agent
        .post('/products/p1/edit')
        .send({ ...form, publication, _csrf: csrf })
        .expect(400)
      expect(response.body.error).toContain('publication')
    }
    expect(service.save).not.toHaveBeenCalled()
    await agent
      .post('/products/p1/edit')
      .type('form')
      .send({ ...form, publication: 'draft', _csrf: csrf })
      .expect(303)
    expect(service.save).toHaveBeenLastCalledWith(
      'p1',
      'admin-token',
      expect.objectContaining({ draft: true, visible: false }),
    )
    await agent
      .post('/products/p1/edit')
      .send({ ...form, publication: 'visible', _csrf: csrf })
      .expect(200)
    expect(service.save).toHaveBeenLastCalledWith(
      'p1',
      'admin-token',
      expect.objectContaining({ draft: false, visible: true }),
    )
  })

  it('rejects missing CSRF and invalid numbers without saving', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    const editor = await agent.get('/products/p1/edit')
    await agent.post('/products/p1/edit').send(form).expect(403)
    const invalid = await agent
      .post('/products/p1/edit')
      .send({
        ...form,
        quantity: '-1',
        _csrf: token(editor.text),
      })
      .expect(400)
    expect(invalid.body.error).toContain('quantity')
    expect(service.save).not.toHaveBeenCalled()
  })

  it('does not offer or allow editing for signed-in customers', async () => {
    const { service } = setup()
    const app = createTestApp({
      productEditorService: service,
      fetchProducts: async () => [product],
      fetchProduct: async () => product,
      tokenClient: {
        getIdentity: async () => ({
          customerId: 'customer-1',
          accessLevel: 0,
        }),
        logout: async () => {},
      },
    })
    const cookie = 'access_token=customer-token'
    const customer = request.agent(app)
    const detail = await customer
      .get('/products/p1')
      .set('Cookie', cookie)
      .expect(200)
    expect(detail.text).not.toContain('href="/products/p1/edit"')
    await customer.get('/products/p1/edit').set('Cookie', cookie).expect(302)
    await customer
      .post('/products/p1/edit')
      .set('Cookie', cookie)
      .send({
        ...form,
        _csrf: token(detail.text),
      })
      .expect(302)
    expect(service.load).not.toHaveBeenCalled()
    expect(service.save).not.toHaveBeenCalled()
  })

  it('returns API errors explicitly while allowing retry', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    const editor = await agent.get('/products/p1/edit')
    vi.mocked(service.save).mockRejectedValueOnce(
      new ProductEditorError(400, 'Category no longer available.'),
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const failed = await agent
        .post('/products/p1/edit')
        .send({
          ...form,
          _csrf: token(editor.text),
        })
        .expect(400)
      expect(failed.body.error).toBe('Category no longer available.')
      await agent
        .post('/products/p1/edit')
        .send({ ...form, _csrf: token(editor.text) })
        .expect(200)
    } finally {
      log.mockRestore()
    }
  })

  it('saves without JavaScript and preserves entered values after validation failure', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    const editor = await agent.get('/products/p1/edit')
    const invalid = await agent
      .post('/products/p1/edit')
      .type('form')
      .send({
        ...form,
        quantity: '-1',
        _csrf: token(editor.text),
      })
      .expect(400)
    expect(invalid.text).toContain('value="Updated"')
    expect(invalid.text).toContain('value="-1"')
    const saved = await agent
      .post('/products/p1/edit')
      .type('form')
      .send({
        ...form,
        _csrf: token(editor.text),
      })
      .expect(303)
    expect(saved.headers.location).toBe('/products/p1/edit?saved=1')
    expect(service.save).toHaveBeenCalledOnce()
  })

  it('renders 404 for a missing product', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    vi.mocked(service.load).mockRejectedValue(
      new ProductEditorError(404, 'Product not found'),
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await agent.get('/products/missing/edit').expect(404)
    } finally {
      log.mockRestore()
    }
  })

  it('accepts the full description length on a non-JavaScript form submission', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    const editor = await agent.get('/products/p1/edit')
    const description = '\u00e9'.repeat(10000)
    await agent
      .post('/products/p1/edit')
      .type('form')
      .send({
        ...form,
        description,
        _csrf: token(editor.text),
      })
      .expect(303)
    expect(service.save).toHaveBeenCalledWith(
      'p1',
      'admin-token',
      expect.objectContaining({ description }),
    )
  })

  it('forwards mixed images in display order and an explicit empty list for removing all images', async () => {
    const { agent, service, signIn } = setup()
    await signIn()
    const editor = await agent.get('/products/p1/edit')
    const images = [
      { imageID: 'i2' },
      { contentType: 'image/png', data: 'aW1hZ2U=' },
      { imageID: 'i1' },
    ]
    await agent
      .post('/products/p1/edit')
      .send({
        ...form,
        _csrf: token(editor.text),
        images,
      })
      .expect(200)
    expect(service.save).toHaveBeenLastCalledWith(
      'p1',
      'admin-token',
      expect.objectContaining({ images }),
    )
    await agent
      .post('/products/p1/edit')
      .send({
        ...form,
        _csrf: token(editor.text),
        images: [],
      })
      .expect(200)
    expect(service.save).toHaveBeenLastCalledWith(
      'p1',
      'admin-token',
      expect.objectContaining({ images: [] }),
    )
  })
})
