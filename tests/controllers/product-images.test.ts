import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';

describe('local product images', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index + 1))(
    'serves product-%i.svg locally instead of requesting the backend',
    async (index) => {
      const fetchProxiedImage = vi.fn(async () => null);
      const response = await request(createApp({ fetchProxiedImage }))
        .get(`/images/product-${index}.svg`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/svg+xml');
      expect(response.body.toString()).toContain('<title');
      expect(fetchProxiedImage).not.toHaveBeenCalled();
    },
  );

  it('continues proxying images that are not present locally', async () => {
    const fetchProxiedImage = vi.fn(async () => ({
      body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=3600',
    }));
    const response = await request(createApp({ fetchProxiedImage }))
      .get('/images/backend-only.svg');

    expect(response.status).toBe(200);
    expect(fetchProxiedImage).toHaveBeenCalledWith('backend-only.svg');
  });
});
