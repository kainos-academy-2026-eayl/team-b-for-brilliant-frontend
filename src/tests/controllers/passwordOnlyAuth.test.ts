import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createAccountClient } from '../../clients/accountClient';
import { createAdminClient } from '../../clients/adminClient';
import type { TokenClient } from '../../clients/tokenClient';
import { createAdminAuthService } from '../../services/adminAuthService';

const baseUrl = 'http://account-service.test';
const flows = [
  { path: '/login', protectedPath: '/home', destination: '/home', status: 302, accessLevel: 0 },
  { path: '/admin/login', protectedPath: '/admin/account', destination: '/admin/account', status: 302, accessLevel: 1 },
  { path: '/register', protectedPath: '/register/details', destination: '/register/details', status: 303, accessLevel: 0 },
] as const;

function csrf(html: string): string {
  const token = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  if (!token) throw new Error('CSRF token not found');
  return token;
}

function setup(accessLevel: 0 | 1, mfaEnabled: unknown) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${baseUrl}/auth/unique-email`) return Response.json({ unique: true });
    if (url === `${baseUrl}/api/v1/auth/register`) {
      return Response.json({ message: 'Registration processed' }, { status: 202 });
    }
    if (url === `${baseUrl}/auth/verify`) {
      return Response.json({
        customerId: 'c1', accessLevel, accessToken: 'backend-jwt',
        ...(mfaEnabled === undefined ? {} : { mfaEnabled }),
      });
    }
    throw new Error(`Unexpected backend request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const getIdentity = vi.fn<TokenClient['getIdentity']>()
    .mockResolvedValue({ customerId: 'c1', accessLevel });
  const agent = request.agent(createApp({
    accountClient: createAccountClient(baseUrl),
    adminAuthService: createAdminAuthService(createAdminClient(baseUrl)),
    tokenClient: { getIdentity, logout: vi.fn<TokenClient['logout']>() },
  }));
  return { agent, getIdentity, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(flows)('password-only authentication through $path', (flow) => {
  it.each([undefined, false])('accepts a completed response with mfaEnabled=%s', async (flag) => {
    const { agent, getIdentity } = setup(flow.accessLevel, flag);
    const page = await agent.get(flow.path).expect(200);
    const response = await agent.post(flow.path).type('form').send({
      _csrf: csrf(page.text), email: 'user@b-brilliant.com', password: 'password',
    }).expect(flow.status).expect('Location', flow.destination);

    expect(getIdentity).toHaveBeenCalledExactlyOnceWith('backend-jwt');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^access_token=backend-jwt;/)]),
    );
  });

  it.each([true, 'true', null])('rejects an unsupported response with mfaEnabled=%s before sign-in', async (flag) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, getIdentity, fetchMock } = setup(flow.accessLevel, flag);
    const page = await agent.get(flow.path).expect(200);
    const response = await agent.post(flow.path).type('form').send({
      _csrf: csrf(page.text), email: 'user@b-brilliant.com', password: 'password',
    }).expect(503);

    expect(getIdentity).not.toHaveBeenCalled();
    expect(response.headers['set-cookie'] ?? []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^access_token=/)]),
    );
    expect(response.text).not.toContain('backend-jwt');
    expect(response.text).not.toContain('/login/mfa');
    expect(response.text).not.toContain('complete multi-factor authentication');
    expect(log).toHaveBeenCalled();
    await agent.get(flow.protectedPath).expect(302);
    expect(fetchMock).toHaveBeenCalledTimes(flow.path === '/register' ? 3 : 1);
  });
});

it('does not expose the retired challenge route', async () => {
  const agent = request.agent(createApp());
  const page = await agent.get('/login').expect(200);
  await agent.get('/login/mfa').expect(404);
  await agent.post('/login/mfa').type('form')
    .send({ _csrf: csrf(page.text), code: '123456' }).expect(404);
});
