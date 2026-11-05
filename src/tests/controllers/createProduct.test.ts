import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../helpers/createTestApp';
import { ProductSaveError, type createProduct } from '../../services/products';
import type { AccountClient } from '../../clients/accountClient';

const form = {
  name: '  New product  ', description: ' Useful product ', quantity: '0',
  weight: '1.50', draft: 'true', price: '19.99',
};
const savedProduct = {
  productID: 'new-product', name: 'New product', description: 'Useful product',
  quantity: 0, weight: 1.5, draft: true, visible: false, salesNo: 0,
  deletedAt: null, productImages: [], categories: [], departments: [],
};
const accountClient: AccountClient = {
  async verifyCredentials() {
    return { status: 'valid', customerId: 'admin-1', accessToken: 'admin-token' };
  },
  async register() { throw new Error('Registration is not used in product creation tests'); },
  async uniqueEmail() { throw new Error('Email uniqueness is not used in product creation tests'); },
};

function csrf(html: string): string {
  const token = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  if (!token) throw new Error('CSRF token not found');
  return token;
}

async function admin(saveProduct: typeof createProduct = vi.fn(async () => savedProduct)) {
  const agent = request.agent(createTestApp({ saveProduct, accountClient, fetchProducts: async () => [] }, 1));
  const login = await agent.get('/login');
  await agent.post('/login').type('form').send({
    _csrf: csrf(login.text), email: 'admin@b-brilliant.com', password: 'correct',
  }).expect(302);
  const page = await agent.get('/products/add').expect(200);
  return { agent, page, token: csrf(page.text) };
}

afterEach(() => vi.restoreAllMocks());

describe('admin product creation', () => {
  it('protects GET and POST from signed-out visitors', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const agent = request.agent(createTestApp({ saveProduct }));
    await agent.get('/products/add').expect(302)
      .expect('Location', '/home');
    const login = await agent.get('/login');
    await agent.post('/products/add').type('form')
      .send({ ...form, _csrf: csrf(login.text) }).expect(302).expect('Location', '/home');
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it('rejects a verified customer identity and hides the create link', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const app = createTestApp({
      saveProduct, fetchProducts: async () => [],
      tokenClient: {
        async getIdentity() { return { customerId: 'customer-1', accessLevel: 0 }; },
        async logout() {},
      },
    });
    const agent = request.agent(app);
    const login = await agent.get('/products').set('Cookie', 'access_token=customer-token');
    await agent.get('/products/add').set('Cookie', 'access_token=customer-token').expect(302).expect('Location', '/home');
    await agent.post('/products/add').set('Cookie', 'access_token=customer-token')
      .type('form').send({ ...form, _csrf: csrf(login.text) }).expect(302).expect('Location', '/home');
    const products = await agent.get('/products').set('Cookie', 'access_token=customer-token');
    expect(products.text).not.toContain('href="/products/add"');
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it('renders the shared layout once, native fields, linked hints and safe defaults', async () => {
    const { page, agent } = await admin();
    expect(page.text.match(/<header\b/g)).toHaveLength(1);
    expect(page.text.match(/id="site-menu"/g)).toHaveLength(1);
    expect(page.text).toContain('/static/theme.js');
    expect(page.text).toContain('action="/products/add"');
    expect(page.text).toContain('value="true" selected>Draft');
    expect(page.text).not.toContain('name="visible"');
    expect(page.text).toContain('Draft products are hidden from the shop.');
    expect(page.text).toContain('src="/static/product-form.js"');
    expect(page.text).toContain('id="image-order" name="imageOrder" type="hidden" value=""');
    expect(page.text).toContain('id="image-order-list"');
    expect(page.text).toContain('class="theme-switch"');
    expect(page.text).toContain('id="description" name="description"');
    expect(page.text).toContain('aria-describedby="weight-hint weight-error"');
    const account = await agent.get('/admin/account');
    expect(account.text).toContain('href="/products/add"');
    expect(account.text).toContain('/static/theme.js');
  });

  it('rejects submissions without CSRF tokens before writing', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent } = await admin(saveProduct);
    await agent.post('/products/add').type('form').send(form).expect(403);
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it('accepts multipart images in order while preserving CSRF protection', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    const submission = agent.post('/products/add').field('_csrf', token);
    for (const [field, value] of Object.entries(form)) submission.field(field, value);
    await submission
      .attach('images', Buffer.from('first image'), { filename: 'first.png', contentType: 'image/png' })
      .attach('images', Buffer.from('second image'), { filename: 'second.webp', contentType: 'image/webp' })
      .expect(303);
    expect(saveProduct).toHaveBeenCalledWith('admin-token',
      expect.objectContaining({ price: '19.99' }),
      [
        expect.objectContaining({ originalname: 'first.png', buffer: Buffer.from('first image') }),
        expect.objectContaining({ originalname: 'second.webp', buffer: Buffer.from('second image') }),
      ]);
    const invalid = agent.post('/products/add').field('_csrf', 'wrong');
    for (const [field, value] of Object.entries(form)) invalid.field(field, value);
    await invalid.attach('images', Buffer.from('image'), { filename: 'image.png' }).expect(403);
    expect(saveProduct).toHaveBeenCalledTimes(1);
  });

  it('forwards every image exactly once in the admin-selected order', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    const submission = agent.post('/products/add').field('_csrf', token).field('imageOrder', '[2,0,1]');
    for (const [field, value] of Object.entries(form)) submission.field(field, value);
    for (const name of ['first', 'second', 'third']) {
      submission.attach('images', Buffer.from(name), { filename: `${name}.png`, contentType: 'image/png' });
    }
    await submission.expect(303);
    expect(saveProduct).toHaveBeenCalledWith('admin-token', expect.objectContaining({ draft: true }),
      ['third', 'first', 'second'].map((name) => expect.objectContaining({
        originalname: `${name}.png`, buffer: Buffer.from(name),
      })));
  });

  it.each(['[0,0]', '[1]', '[2,0]', 'not JSON', '[]'])('rejects the invalid image permutation %s', async (imageOrder) => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    const submission = agent.post('/products/add').field('_csrf', token).field('imageOrder', imageOrder);
    for (const [field, value] of Object.entries(form)) submission.field(field, value);
    const response = await submission
      .attach('images', Buffer.from('first'), { filename: 'first.png', contentType: 'image/png' })
      .attach('images', Buffer.from('second'), { filename: 'second.png', contentType: 'image/png' })
      .expect(400);
    expect(response.text).toContain('The image order is invalid.');
    expect(response.text).toMatch(/id="images"[^>]+aria-invalid="true"/);
    expect(response.text).toContain('value="19.99"');
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it.each(['true', 'false'])('ignores a submitted visibility override when draft=%s', async (draft) => {
    const saveProduct = vi.fn<typeof createProduct>(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    await agent.post('/products/add').type('form')
      .send({ ...form, draft, visible: draft, _csrf: token }).expect(303);
    const data = saveProduct.mock.calls[0]?.[1];
    expect(data).toMatchObject({ draft: draft === 'true' });
    expect(data).not.toHaveProperty('visible');
  });

  it('serves the image ordering script through shared static assets', async () => {
    const { agent } = await admin();
    const response = await agent.get('/static/product-form.js').expect(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.text).toContain("getElementById('image-order')");
  });

  it.each(['type', 'size', 'count'])('rejects invalid upload %s without creating a product', async (kind) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    const submission = agent.post('/products/add').field('_csrf', token);
    for (const [field, value] of Object.entries(form)) submission.field(field, value);
    if (kind === 'count') {
      for (let index = 0; index < 6; index++) {
        submission.attach('images', Buffer.from('image'), { filename: `${index}.png`, contentType: 'image/png' });
      }
    } else {
      submission.attach('images', Buffer.alloc(kind === 'size' ? 5 * 1024 * 1024 + 1 : 5), {
        filename: kind === 'type' ? 'image.svg' : 'image.png',
        contentType: kind === 'type' ? 'image/svg+xml' : 'image/png',
      });
    }
    const response = await submission.expect(400);
    expect(response.text).toContain('id="images"');
    expect(response.text).toContain('aria-invalid="true"');
    expect(response.text).toContain('select them again');
    expect(response.text).toContain('value="19.99"');
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it('converts and trims fields, uses the verified token and confirms only once after redirect', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    await agent.post('/products/add').type('form').send({ ...form, _csrf: token })
      .expect(303).expect('Location', '/products/add');
    expect(saveProduct).toHaveBeenCalledExactlyOnceWith('admin-token', {
      name: 'New product', description: 'Useful product', quantity: 0,
      weight: 1.5, draft: true, price: '19.99',
    }, []);
    const confirmation = await agent.get('/products/add').expect(200);
    expect(confirmation.text).toContain('Product created successfully.');
    expect(confirmation.headers['cache-control']).toBe('no-store');
    expect((await agent.get('/products/add')).text).not.toContain('Product created successfully.');
    expect(saveProduct).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['name', '   '], ['quantity', '-1'], ['quantity', '1.2'],
    ['quantity', '2147483648'], ['quantity', '1e2'], ['weight', '-1'],
    ['weight', 'Infinity'], ['weight', 'NaN'], ['weight', ''],
    ['draft', 'yes'], ['name', ['one', 'two']],
    ['description', ['one', 'two']],
    ['price', ''], ['price', '-1'], ['price', '1.234'], ['price', '100000000'],
    ['price', '1e2'], ['price', ['1', '2']],
  ])('rejects invalid %s=%s, associates the error and retains other values', async (field, value) => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    const response = await agent.post('/products/add').type('form')
      .send({ ...form, [field]: value, _csrf: token }).expect(400);
    expect(saveProduct).not.toHaveBeenCalled();
    expect(response.text).toContain('Please fix the problems below');
    expect(response.text).toMatch(new RegExp(`id="${field}"[^>]+aria-invalid="true"`));
    if (field !== 'description') expect(response.text).toContain(' Useful product </textarea>');
  });

  it('accepts numeric boundaries, optional blank description and explicit false booleans', async () => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    await agent.post('/products/add').type('form')
      .send({ ...form, description: ' ', quantity: '2147483647', weight: '0', draft: 'false', _csrf: token })
      .expect(303);
    expect(saveProduct).toHaveBeenCalledWith('admin-token', expect.objectContaining({
      description: null, quantity: 2_147_483_647, weight: 0, draft: false,
    }), []);
  });

  it.each(['0', '99999999.99', '19.9', ' 19.99 '])('accepts the valid price %s', async (price) => {
    const saveProduct = vi.fn(async () => savedProduct);
    const { agent, token } = await admin(saveProduct);
    await agent.post('/products/add').type('form')
      .send({ ...form, price, _csrf: token }).expect(303);
    expect(saveProduct).toHaveBeenCalledWith(
      'admin-token', expect.objectContaining({ price: price.trim() }), [],
    );
  });

  it.each([401, 403])('redirects home when the backend denies product creation with %s', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, token } = await admin(async () => { throw new ProductSaveError(status); });
    await agent.post('/products/add').type('form').send({ ...form, _csrf: token })
      .expect(303).expect('Location', '/home');
    const home = await agent.get('/home').expect(200);
    expect(home.text).not.toContain('Product created successfully.');
  });

  it.each([400, 500])('shows an explicit backend %s failure without losing values', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, token } = await admin(async () => { throw new ProductSaveError(status); });
    const response = await agent.post('/products/add').type('form').send({
      ...form, name: '<script>alert(1)</script>', _csrf: token,
    }).expect(status < 500 ? status : 502);
    expect(response.text).toContain('role="alert"');
    expect(response.text).toContain('value="&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(response.text).not.toContain('Product created successfully.');
  });

  it('reports network errors without a success confirmation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, token } = await admin(async () => { throw new Error('Network failed'); });
    const response = await agent.post('/products/add').type('form')
      .send({ ...form, _csrf: token }).expect(502);
    expect(response.text).toContain('The product could not be saved right now.');
    expect((await agent.get('/products/add')).text).not.toContain('Product created successfully.');
  });
});
