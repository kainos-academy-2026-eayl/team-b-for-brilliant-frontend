import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTokenClient } from '../../clients/tokenClient';

const baseUrl = 'http://account-service.test';
const client = createTokenClient(baseUrl);

afterEach(() => vi.unstubAllGlobals());

describe('backend JWT validation', () => {
  it('gets verified identity using the bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ customerId: 'c1', accessLevel: 1 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.getIdentity('backend-jwt')).resolves.toEqual({
      customerId: 'c1', accessLevel: 1,
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/auth/session`,
      expect.objectContaining({ headers: { Authorization: 'Bearer backend-jwt' } }));
  });

  it('rejects a token the backend marks invalid, expired or revoked', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 401 }),
    ));
    await expect(client.getIdentity('rejected-jwt')).resolves.toBeNull();
  });

  it.each([404, 500, 503])('surfaces HTTP %s rather than authenticating', async (status) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status }),
    ));
    await expect(client.getIdentity('backend-jwt')).rejects.toThrow(
      `Token validation responded ${status}`,
    );
  });

  it.each([
    { customerId: '', accessLevel: 0 },
    { customerId: 'c1' },
    { customerId: 'c1', accessLevel: '1' },
    { customerId: 'c1', accessLevel: 2 },
  ])('rejects malformed identities: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)));
    await expect(client.getIdentity('backend-jwt')).rejects.toThrow();
  });

  it('surfaces network failures', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
    await expect(client.getIdentity('backend-jwt')).rejects.toThrow('offline');
  });
});

describe('backend JWT revocation', () => {
  it('revokes the exact bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await client.logout('backend-jwt');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/auth/logout`,
      expect.objectContaining({
        method: 'POST', headers: { Authorization: 'Bearer backend-jwt' },
      }));
  });

  it('surfaces revocation failures', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 500 }),
    ));
    await expect(client.logout('backend-jwt')).rejects.toThrow('Token revocation responded 500');
  });
});
