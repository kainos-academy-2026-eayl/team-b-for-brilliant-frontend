import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '../../clients/adminClient';

const baseUrl = 'http://account-service.test';
afterEach(() => vi.unstubAllGlobals());

describe('admin JWT credentials', () => {
  it('uses the existing backend credential endpoint and retains the admin JWT', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ accessLevel: 1, accessToken: 'admin-jwt' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(createAdminClient(baseUrl).verifyCredentials('a@b-brilliant.com', 'password'))
      .resolves.toEqual({ status: 'valid', accessToken: 'admin-jwt' });
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/auth/verify`,
      expect.objectContaining({ method: 'POST' }));
  });

  it('does not grant admin access to a customer JWT', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ accessLevel: 0, accessToken: 'customer-jwt' }),
    ));
    await expect(createAdminClient(baseUrl).verifyCredentials('a@b-brilliant.com', 'password'))
      .resolves.toEqual({ status: 'invalid' });
  });

  it.each([{ accessLevel: 1 }, { accessToken: 'jwt' }, { accessLevel: 2, accessToken: 'jwt' }])(
    'rejects malformed admin responses: %j', async (body) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)));
      await expect(createAdminClient(baseUrl).verifyCredentials('a@b-brilliant.com', 'password'))
        .rejects.toThrow();
    },
  );
});
