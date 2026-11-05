import { describe, expect, it, vi } from 'vitest';
import { createProduct, ProductSaveError } from '../../services/products';

const input = {
  name: 'New product', description: null, quantity: 0, weight: 1.5, draft: true, price: '19.99',
};
const product = {
  name: input.name, description: input.description, quantity: input.quantity,
  weight: input.weight, draft: input.draft, visible: false,
  productID: 'new-product', salesNo: 0, deletedAt: null,
  categories: [], departments: [], productImages: [],
};

describe('createProduct API service', () => {
  it('sends multipart fields and images with bearer authentication and validates the created product', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ product }), { status: 201 }));
    const images = [{ buffer: Buffer.from('image bytes'), mimetype: 'image/png', originalname: 'sample.png' }];
    expect(await createProduct('admin-token', input, images, 'http://backend.test', fetchFn)).toEqual(product);
    const [url, options] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://backend.test/products');
    expect(options).toMatchObject({
      method: 'POST', cache: 'no-store',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(options?.headers).not.toHaveProperty('Content-Type');
    expect(options?.body).toBeInstanceOf(FormData);
    if (!(options?.body instanceof FormData)) throw new Error('Expected multipart body');
    expect(options.body.get('price')).toBe('19.99');
    expect(options.body.get('quantity')).toBe('0');
    expect(options.body.get('description')).toBe('');
    expect(options.body.get('draft')).toBe('true');
    expect(options.body.has('visible')).toBe(false);
    const image = options.body.get('images');
    if (!(image instanceof File)) throw new Error('Expected an uploaded file');
    expect(image.name).toBe('sample.png');
    expect(await image.text()).toBe('image bytes');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([200, 400, 401, 403, 500])('rejects unexpected HTTP %s responses', async (status) => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('{}', { status }));
    await expect(createProduct('token', input, [], 'http://backend.test', fetchFn))
      .rejects.toEqual(new ProductSaveError(status));
  });

  it.each([{}, { product: { productID: 'incomplete' } }])('rejects malformed success payloads', async (body) => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(body), { status: 201 }));
    await expect(createProduct('token', input, [], 'http://backend.test', fetchFn))
      .rejects.toThrow('Created product response from backend did not match schema');
  });

  it('propagates transport failures', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => { throw new Error('Connection refused'); });
    await expect(createProduct('token', input, [], 'http://backend.test', fetchFn))
      .rejects.toThrow('Connection refused');
  });

  it('preserves actionable image validation errors returned by the backend', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: 'An image could not be read.',
      details: { fieldErrors: { images: ['Upload a valid image.'] } },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    await expect(createProduct('token', input, [], 'http://backend.test', fetchFn))
      .rejects.toEqual(new ProductSaveError(400, 'An image could not be read.', { images: ['Upload a valid image.'] }));
  });
});
