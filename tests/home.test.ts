import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { AccountClient } from '../src/clients/accountClient';
import type { ProductWithPrice } from '../src/models/product';

const accountClient: AccountClient = {
  async verifyCredentials() {
    return { status: 'valid', customerId: 'c1', mfaEnabled: false };
  },
  async verifyMfa() {
    throw new Error('MFA verification should not run when MFA is disabled');
  },
};

function product(index: number): ProductWithPrice {
  return {
    productID: `p${index}`,
    salesNo: index,
    name: `Product ${index}`,
    description: null,
    quantity: 3,
    draft: false,
    visible: true,
    weight: 1,
    deletedAt: null,
    productImages: [
      {
        imageID: `i${index}`,
        productID: `p${index}`,
        imageUrl: `/images/product-${index}.svg`,
        imageOrder: 0,
      },
    ],
    currentPrice: '12.50',
  };
}

async function signedInAgent(fetchProducts: () => Promise<ProductWithPrice[]>) {
  const agent = request.agent(createApp({ accountClient, fetchProducts }));
  const login = await agent.get('/login');
  const token = /name="_csrf" value="([^"]+)"/.exec(login.text)?.[1];
  if (!token) throw new Error('CSRF token not found');
  await agent
    .post('/login')
    .type('form')
    .send({
      _csrf: token,
      email: 'jane@example.com',
      password: 'correct',
    })
    .expect(302);
  return agent;
}

describe('GET /home', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires sign-in without fetching products', async () => {
    const fetchProducts = vi.fn(async () => []);
    const response = await request(createApp({ fetchProducts })).get('/home');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login?returnTo=%2Fhome');
    expect(fetchProducts).not.toHaveBeenCalled();
  });

  it('renders the three highest-selling products without mutating the catalogue', async () => {
    const products = Array.from({ length: 6 }, (_, index) => product(index));
    const original = [...products];
    const fetchProducts = vi.fn(async () => products);
    const agent = await signedInAgent(fetchProducts);
    const first = await agent.get('/home');
    const second = await agent.get('/home');
    const names = (html: string) =>
      [...html.matchAll(/class="product-name"><a[^>]*>([^<]+)<\/a>/g)].map(
        (match) => match[1],
      );

    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(names(first.text)).toEqual(['Product 5', 'Product 4', 'Product 3']);
    expect(names(second.text)).toEqual(names(first.text));
    expect(new Set(names(first.text)).size).toBe(3);
    expect(products).toEqual(original);
    expect(fetchProducts).toHaveBeenCalledTimes(2);
    expect(first.text).toContain('Featured products');
    expect(first.text).toContain('href="/products">View all products');
    expect(first.text).toContain('href="/products/p5"');
    expect(first.text).toContain('src="/images/product-5.svg"');
    expect(first.text).toContain('class="home-hero-image" src="/images/product-5.svg" alt="Product 5"');
    expect(first.text).not.toContain('/assets/images/tote.svg');
    expect(first.text).toContain('£12.50');
    expect(first.text).not.toContain('Demo catalogue');
    expect(first.text).not.toContain('/assets/js/home.js');
  });

  it('breaks sales ties by descending product ID, including ties at the third-place cutoff', async () => {
    const agent = await signedInAgent(async () => [
      { ...product(2), salesNo: 10 },
      { ...product(9), salesNo: 10 },
      { ...product(10), salesNo: 10 },
      { ...product(3), salesNo: 10 },
      { ...product(1), salesNo: 20 },
      { ...product(99), salesNo: 0 },
    ]);
    const response = await agent.get('/home');
    const names = [
      ...response.text.matchAll(/class="product-name"><a[^>]*>([^<]+)<\/a>/g),
    ].map((match) => match[1]);

    expect(names).toEqual(['Product 1', 'Product 10', 'Product 9']);
  });

  it('uses the highest IDs when all sales totals are zero', async () => {
    const agent = await signedInAgent(async () =>
      [2, 9, 10, 3].map((index) => ({ ...product(index), salesNo: 0 })),
    );
    const response = await agent.get('/home');
    const names = [
      ...response.text.matchAll(/class="product-name"><a[^>]*>([^<]+)<\/a>/g),
    ].map((match) => match[1]);

    expect(names).toEqual(['Product 10', 'Product 9', 'Product 3']);
    expect(response.text).toContain('class="home-hero-image" src="/images/product-10.svg" alt="Product 10"');
  });

  it('does not substitute a lower-selling image when the highest seller has none', async () => {
    const agent = await signedInAgent(async () => [
      product(1),
      { ...product(2), productImages: [] },
    ]);
    const response = await agent.get('/home');

    expect(response.status).toBe(200);
    expect(response.text).toContain('class="home-hero-placeholder">No image available');
    expect(response.text).not.toContain('class="home-hero-image"');
    expect(response.text).toContain('src="/images/product-1.svg"');
  });

  it.each([0, 1, 2, 3])(
    'renders the available %i products without filling with demo items',
    async (count) => {
      const agent = await signedInAgent(async () =>
        Array.from({ length: count }, (_, index) => product(index)),
      );
      const response = await agent.get('/home');

      expect(response.status).toBe(200);
      expect(response.text.match(/class="product-card"/g) ?? []).toHaveLength(
        count,
      );
      expect(response.text.includes('No products available')).toBe(count === 0);
      if (count === 0) {
        expect(response.text).toContain('class="home-hero-placeholder">No image available');
        expect(response.text).not.toContain('class="home-hero-image"');
      }
      expect(response.text).toContain('href="/products">View all products');
    },
  );

  it('excludes hidden, draft and deleted products', async () => {
    const agent = await signedInAgent(async () => [
      { ...product(0), visible: false },
      { ...product(1), draft: true },
      { ...product(2), deletedAt: '2026-10-22T00:00:00Z' },
      product(3),
    ]);
    const response = await agent.get('/home');

    expect(response.text.match(/class="product-card"/g)).toHaveLength(1);
    expect(response.text).toContain('Product 3');
    for (const index of [0, 1, 2]) {
      expect(response.text).not.toContain(`Product ${index}`);
    }
  });

  it('escapes names, encodes product links and shows missing image, price and stock states', async () => {
    const agent = await signedInAgent(async () => [
      {
        ...product(0),
        productID: 'id/with space',
        name: '<Widget>',
        productImages: [],
        currentPrice: null,
        quantity: 0,
      },
    ]);
    const response = await agent.get('/home');

    expect(response.text).toContain('&lt;Widget&gt;');
    expect(response.text).toContain('href="/products/id%2Fwith%20space"');
    expect(response.text).toContain('No image available');
    expect(response.text).not.toContain('class="home-hero-image"');
    expect(response.text).toContain('Price unavailable');
    expect(response.text).toContain('Out of stock');
  });

  it('reports backend failures with a retry link and keeps the catalogue link available', async () => {
    const error = new Error('Backend unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => { });
    const agent = await signedInAgent(async () => {
      throw error;
    });
    const response = await agent.get('/home');

    expect(response.status).toBe(502);
    expect(response.text).toContain('role="alert"');
    expect(response.text).toContain('We could not load products right now.');
    expect(response.text).toContain('class="home-hero-placeholder">No image available');
    expect(response.text).toContain('href="/home">Try again');
    expect(response.text).toContain('href="/products">View all products');
    expect(response.text).not.toContain('No products available');
    expect(log).toHaveBeenCalledWith(error);
  });
});
