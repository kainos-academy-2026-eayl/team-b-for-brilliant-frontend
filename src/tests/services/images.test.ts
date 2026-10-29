import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchImage, MAX_IMAGE_BYTES, toProxiedImageUrl } from '../../services/images';

const baseUrl = 'http://localhost:3001';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toProxiedImageUrl', () => {
  it.each([
    'http://[',
    '',
    '/not-images/product.svg',
    'https://other.example/images/product.svg',
    '/images/nested/product.svg',
    '/images/..%2Fprivate.svg',
    '/images/%ZZ.svg',
    '/images/',
    '/images/product..svg',
  ])('uses the local placeholder for a faulty URL: %s', (imageUrl) => {
    expect(toProxiedImageUrl(imageUrl, baseUrl)).toBe('/images/placeholder.svg');
    expect(console.warn).toHaveBeenCalled();
  });

  it.each(['/images/product.svg', `${baseUrl}/images/product.svg`])(
    'preserves a valid image path: %s',
    (imageUrl) => {
      expect(toProxiedImageUrl(imageUrl, baseUrl)).toBe('/images/product.svg');
      expect(console.warn).not.toHaveBeenCalled();
    },
  );

  it('does not hide invalid backend configuration', () => {
    expect(() => toProxiedImageUrl('/images/product.svg', 'invalid')).toThrow();
  });
});

describe('fetchImage', () => {
  it.each([404, 500])('uses a local fallback for HTTP %s without retrying', async (status) => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    const image = await fetchImage('missing.svg', baseUrl, fetchFn);
    expect(image?.contentType).toBe('image/svg+xml');
    expect(image?.body.toString()).toContain('Product image coming soon');
    expect(image?.cacheControl).toBe('no-store');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    new Response('Not an image', { headers: { 'Content-Type': 'text/html' } }),
    new Response('large', {
      headers: { 'Content-Type': 'image/png', 'Content-Length': String(MAX_IMAGE_BYTES + 1) },
    }),
    new Response(Buffer.alloc(MAX_IMAGE_BYTES + 1), { headers: { 'Content-Type': 'image/png' } }),
  ])('uses a local fallback for an unusable image response %#', async (response) => {
    const fetchFn = vi.fn<typeof fetch>(async () => response);
    const image = await fetchImage('product.png', baseUrl, fetchFn);
    expect(image?.body.toString()).toContain('Product image coming soon');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it('preserves valid image bytes and cache headers', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('image bytes', {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
    }));
    const image = await fetchImage('product.png', baseUrl, fetchFn);
    expect(image?.body.toString()).toBe('image bytes');
    expect(image?.cacheControl).toBe('public, max-age=60');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('rejects unsafe direct requests without contacting the backend', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await fetchImage('../private.svg', baseUrl, fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('propagates network failures to the controller', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network unavailable'));
    await expect(fetchImage('product.svg', baseUrl, fetchFn)).rejects.toThrow('Network unavailable');
  });
});
