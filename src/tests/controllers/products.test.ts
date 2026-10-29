import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { ProductWithPrice } from '../../models/product';
import { getProductsWithPrices, getProductWithPrice, type ProductFilters } from '../../services/products';

const product: ProductWithPrice = {
  productID: 'p1',
  salesNo: 10,
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
};

async function getPage(
  fetchProducts: (filters?: ProductFilters) => Promise<ProductWithPrice[]>,
  path = '/products',
  fetchProduct?: (productID: string) => Promise<ProductWithPrice | null>,
) {
  const server = createApp({
    fetchProducts,
    ...(fetchProduct && { fetchProduct }),
  }).listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return {
      status: response.status,
      html: await response.text(),
      cacheControl: response.headers.get('cache-control'),
    };
  } finally {
    server.close();
    await once(server, 'close');
  }
}

describe('GET /products', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes trimmed search text to the service and renders its results', async () => {
    const fetchProducts = vi.fn(async (_filters?: ProductFilters) => [product]);
    const { status, html } = await getPage(
      fetchProducts,
      '/products?q=%20WiDg%20',
    );

    expect(status).toBe(200);
    expect(fetchProducts).toHaveBeenNthCalledWith(1, { q: 'WiDg' });
    expect(fetchProducts).toHaveBeenNthCalledWith(2);
    expect(html).toContain('href="/products/p1"');
    expect(html).not.toContain('href="/products/p2"');
    expect(html).toContain('name="q" value="WiDg"');
    expect(html).toContain('1 product found for &ldquo;WiDg&rdquo;.');
    expect(html).toContain('<button type="submit" class="button">Search</button>');
    expect(html).toContain('href="/products">Clear search</a>');
  });

  it.each(['/products?q=', '/products?q=%20%20'])(
    'shows all products for an empty search: %s',
    async (path) => {
      const { html } = await getPage(async () => [product], path);
      expect(html).toContain('href="/products/p1"');
      expect(html).not.toContain('product found for');
    },
  );

  it('combines name and category filters while keeping the full category dropdown', async () => {
    const category = {
      categoryID: 'c1',
      name: 'Tools',
      description: null,
      departmentID: 'd1',
    };
    const fetchProducts = vi.fn<(filters?: ProductFilters) => Promise<ProductWithPrice[]>>()
      .mockResolvedValueOnce([{ ...product, categories: [category] }])
      .mockResolvedValueOnce([
        { ...product, categories: [category] },
        { ...product, productID: 'p2', name: 'Different item', categories: [category] },
        {
          ...product,
          productID: 'p3',
          categories: [{ ...category, categoryID: 'c2', name: 'Other category' }],
        },
      ]);
    const { html } = await getPage(
      fetchProducts,
      '/products?q=widget&category=c1',
    );

    expect(fetchProducts).toHaveBeenNthCalledWith(1, { q: 'widget', category: 'c1' });
    expect(fetchProducts).toHaveBeenNthCalledWith(2);
    expect(html).toContain('href="/products/p1"');
    expect(html).not.toContain('href="/products/p2"');
    expect(html).not.toContain('href="/products/p3"');
    expect(html).toContain('value="c2">Other category</option>');
    expect(html).toContain('type="hidden" name="category" value="c1"');
    expect(html).toContain('type="hidden" name="q" value="widget"');
    expect(html).toContain('1 product found for &ldquo;widget&rdquo; in &ldquo;Tools&rdquo;.');
  });

  it('shows a useful empty state when no names match', async () => {
    const { html } = await getPage(async () => [], '/products?q=missing');
    expect(html).toContain('0 products found for &ldquo;missing&rdquo;.');
    expect(html).toContain('No products match your search.');
    expect(html).not.toContain('href="/products/p1"');
  });

  it('escapes the displayed query and passes special characters unchanged to the service', async () => {
    const query = '<script>alert("x")</script>.*';
    const fetchProducts = vi.fn(async (_filters?: ProductFilters) => []);
    const { html } = await getPage(
      fetchProducts,
      `/products?q=${encodeURIComponent(query)}`,
    );
    expect(fetchProducts).toHaveBeenNthCalledWith(1, { q: query });
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;.*');
    expect(html).not.toContain(query);
    expect(html).not.toContain('href="/products/p1"');
  });

  it('does not re-filter backend results locally', async () => {
    const { html } = await getPage(async () => [product], '/products?q=backend-match');
    expect(html).toContain('href="/products/p1"');
  });

  it('passes an empty filter object and avoids a second catalogue request without filters', async () => {
    const fetchProducts = vi.fn(async (_filters?: ProductFilters) => [product]);
    await getPage(fetchProducts);
    expect(fetchProducts).toHaveBeenCalledExactlyOnceWith({});
  });

  it('shows an error when the unfiltered category catalogue cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchProducts = vi.fn<() => Promise<ProductWithPrice[]>>()
      .mockResolvedValueOnce([product])
      .mockRejectedValueOnce(new Error('Category catalogue unavailable'));
    const { status, html } = await getPage(fetchProducts, '/products?q=widget');
    expect(status).toBe(502);
    expect(html).toContain('We could not load products right now.');
    expect(html).not.toContain('Category catalogue unavailable');
  });

  it.each([
    '/products?q=one&q=two',
    '/products?category=one&category=two',
  ])('rejects invalid filter shapes before fetching products: %s', async (path) => {
    const fetchProducts = vi.fn(async () => [product]);
    const { status } = await getPage(fetchProducts, path);
    expect(status).toBe(400);
    expect(fetchProducts).not.toHaveBeenCalled();
  });

  it('renders products and their current price instead of the description', async () => {
    const { status, html } = await getPage(async () => [product]);

    expect(status).toBe(200);
    expect(html).toContain('&lt;Widget&gt;');
    expect(html).toContain('£22.49');
    expect(html).not.toContain('A useful widget');
    expect(html).not.toContain('Quantity');
    expect(html).not.toContain('Weight');
    expect(html).toContain('src="/images/product-1.svg"');
    expect(html).not.toContain('localhost:3001');
    expect(html).toContain('href="/products/p1"');
  });

  describe('GET /products/:productID', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders fresh data for each selected product using the same template', async () => {
      const fetchProducts = vi.fn(async () => [product]);
      const fetchProduct = vi.fn(async (productID: string) => ({
        ...product,
        productID,
        name: productID === 'p1' ? '<Fresh widget>' : 'Second widget',
      }));

      const first = await getPage(fetchProducts, '/products/p1', fetchProduct);
      const second = await getPage(fetchProducts, '/products/p2', fetchProduct);

      expect(first.status).toBe(200);
      expect(first.cacheControl).toBe('no-store');
      expect(first.html).toContain('&lt;Fresh widget&gt;');
      expect(first.html).toContain('A useful widget');
      expect(first.html).toContain('£22.49');
      expect(first.html).toContain('src="/images/product-1.svg"');
      expect(first.html).toContain('href="/products"');
      expect(first.html).not.toContain('Weight');
      expect(second.html).toContain('Second widget');
      expect(fetchProduct.mock.calls).toEqual([['p1'], ['p2']]);
      expect(fetchProducts).not.toHaveBeenCalled();
    });

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
      );
      expect(html).toContain('No image available');
      expect(html).toContain('Price unavailable');
      expect(html).toContain('Out of stock');
      expect(html).not.toContain('<h2>Description</h2>');
      expect(html).not.toContain('class="product-detail__thumbnail"');
      expect(html).not.toContain('product-gallery.js');
    });

    it('shows stock-limited quantity choices and a UI-only basket button between price and description', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => product,
      );

      expect(html).toContain('<label for="product-quantity">Quantity</label>');
      expect(html).toContain('<select id="product-quantity" name="quantity">');
      expect(html.match(/<option value="\d+">\d+<\/option>/g)).toEqual([
        '<option value="1">1</option>',
        '<option value="2">2</option>',
        '<option value="3">3</option>',
      ]);
      expect(html).toContain('<button type="button" class="button">Add to basket</button>');
      expect(html.indexOf('£22.49')).toBeLessThan(html.indexOf('id="product-quantity"'));
      expect(html.indexOf('id="product-quantity"')).toBeLessThan(html.indexOf('Add to basket'));
      expect(html.indexOf('Add to basket')).toBeLessThan(html.indexOf('<h2>Description</h2>'));
    });

    it('caps quantity choices at 10 when stock is higher', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({ ...product, quantity: 50 }),
      );

      const values = html.match(/<option value="\d+">/g) ?? [];
      expect(values).toHaveLength(10);
      expect(html).toContain('<option value="10">10</option>');
      expect(html).not.toContain('<option value="11">');
    });

    it.each([0, -1])('disables basket controls when stock is %s', async (quantity) => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => ({ ...product, quantity }),
      );

      expect(html).toContain('<select id="product-quantity" name="quantity" disabled>');
      expect(html).toContain('<option value="0">0</option>');
      expect(html).toContain('<button type="button" class="button" disabled>Add to basket</button>');
      expect(html).not.toContain('<option value="1">');
    });

    it('renders a single main image without thumbnail controls for one image', async () => {
      const { html } = await getPage(
        async () => [],
        '/products/p1',
        async () => product,
      );

      expect(html).toContain('id="product-main-image" src="/images/product-1.svg"');
      expect(html.match(/<img /g)).toHaveLength(1);
      expect(html).not.toContain('class="product-detail__thumbnail"');
      expect(html).not.toContain('product-gallery.js');
    });

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
      );

      expect(html).toContain('product-detail__images--gallery');
      expect(html).toContain('id="product-main-image" src="/images/product-1.svg"');
      expect(html.match(/class="product-detail__thumbnail"/g)).toHaveLength(3);
      expect(html.match(/\saria-pressed="true"/g)).toHaveLength(1);
      expect(html.match(/\saria-pressed="false"/g)).toHaveLength(2);
      for (let index = 1; index <= 3; index++) {
        expect(html).toContain(`data-image-src="/images/product-${index}.svg"`);
        expect(html).toContain(`View image ${index} of 3 for &lt;Widget&gt;`);
      }
      expect(html).toContain('src="/static/product-gallery.js"');
    });

    it('returns a useful 404 when the product cannot be shown', async () => {
      const { status, html } = await getPage(
        async () => [],
        '/products/missing',
        async () => null,
      );
      expect(status).toBe(404);
      expect(html).toContain('Product not found');
      expect(html).toContain('href="/products"');
    });

    it('returns 502 without leaking backend errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => { });
      const { status, html } = await getPage(
        async () => [],
        '/products/p1',
        async () => {
          throw new Error('connect ECONNREFUSED');
        },
      );
      expect(status).toBe(502);
      expect(html).toContain('We could not load this product right now.');
      expect(html).not.toContain('ECONNREFUSED');
    });
  });

  it('renders a placeholder when a product has no current price', async () => {
    const { html } = await getPage(async () => [
      { ...product, currentPrice: null },
    ]);

    expect(html).toContain('Price unavailable');
  });

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
      };
      const fetchFn = vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname;
        const body = path.endsWith('/prices/current')
          ? { price: null }
          : path === '/products'
            ? { products: [unorderedProduct] }
            : { product: unorderedProduct };
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        });
      });
      const fetchProducts = () =>
        getProductsWithPrices('http://localhost:3001', fetchFn);
      const fetchProduct = (id: string) =>
        getProductWithPrice(id, 'http://localhost:3001', fetchFn);

      const catalogue = await getPage(fetchProducts);
      const detail = await getPage(fetchProducts, '/products/p1', fetchProduct);

      expect(catalogue.status).toBe(200);
      expect(catalogue.html).toContain(`src="/images/order-${lowestOrder}.svg"`);
      expect(catalogue.html).not.toContain('src="/images/order-10.svg"');
      expect(detail.status).toBe(200);
      expect(detail.html).toContain(
        `id="product-main-image" src="/images/order-${lowestOrder}.svg"`,
      );
      const thumbnails = [...detail.html.matchAll(/data-image-src="([^"]+)"/g)];
      expect(thumbnails.map((match) => match[1])).toEqual([
        `/images/order-${lowestOrder}.svg`,
        '/images/order-3.svg',
        '/images/order-10.svg',
      ]);
    },
  );

  it('renders an empty state when there are no products', async () => {
    const { status, html } = await getPage(async () => []);

    expect(status).toBe(200);
    expect(html).toContain('No products available.');
  });

  it('renders an error page when the backend is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => { });

    const { status, html } = await getPage(async () => {
      throw new Error('connect ECONNREFUSED');
    });

    expect(status).toBe(502);
    expect(html).toContain('We could not load products right now.');
    expect(html).not.toContain('ECONNREFUSED');
  });
});
