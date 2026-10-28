import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';


it('continues proxying images that are not present locally', async () => {
  const fetchProxiedImage = vi.fn(async () => ({
    body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    contentType: 'image/svg+xml',
    cacheControl: 'public, max-age=3600',
  }));
  const response = await request(createApp({ fetchProxiedImage })).get(
    '/images/backend-only.svg',
  );

  expect(response.status).toBe(200);
  expect(fetchProxiedImage).toHaveBeenCalledWith('backend-only.svg');
});

