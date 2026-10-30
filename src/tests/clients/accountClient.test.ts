import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccountClient } from '../../clients/accountClient';

const baseUrl = 'http://account-service.test';

afterEach(() => vi.unstubAllGlobals());

it('preserves the backend access token after verifying credentials', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({ customerId: 'customer-1', accessToken: 'server-side-token' }),
  ));
  await expect(createAccountClient(baseUrl).verifyCredentials('user@example.com', 'password123'))
    .resolves.toEqual({
      status: 'valid', customerId: 'customer-1', mfaEnabled: false, accessToken: 'server-side-token',
    });
});

describe('registration API contract', () => {
  it.each([
    [true, 'unique'],
    [false, 'not_unique'],
  ] as const)('reads unique=%s from a successful JSON response', async (unique, status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ unique }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAccountClient(baseUrl).uniqueEmail('user@example.com'))
      .resolves.toEqual({ status });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/auth/unique-email`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
    );
  });

  it('rejects malformed uniqueness responses instead of assuming the email is unique', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ unique: 'false' }),
    ));
    await expect(createAccountClient(baseUrl).uniqueEmail('user@example.com'))
      .rejects.toThrow();
  });

  it('uses the documented registration URL and accepts a 202 without a customer ID', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ message: 'Registration request processed' }, { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAccountClient(baseUrl).register('user@example.com', 'password123'))
      .resolves.toEqual({ status: 'registered' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/auth/register`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      }),
    );
  });

  it.each([400, 404, 500])('surfaces an upstream registration HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: 'Request failed' }, { status }),
    ));
    await expect(createAccountClient(baseUrl).register('user@example.com', 'password123'))
      .rejects.toThrow(`Account service responded ${status}`);
  });

  it('surfaces a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Connection refused')));
    await expect(createAccountClient(baseUrl).register('user@example.com', 'password123'))
      .rejects.toThrow('Connection refused');
  });
});
