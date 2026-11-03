import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';
import type { TokenClient } from '../../clients/tokenClient';
import { createTestApp } from '../helpers/createTestApp';
import { tokenHash } from '../../middleware/browserState';

const secret = 'test-only-browser-state-signing-secret';
const accountClient: AccountClient = {
  async verifyCredentials() {
    return { status: 'valid', customerId: 'c1', mfaEnabled: false, accessToken: 'backend-jwt' };
  },
  async verifyMfa() { throw new Error('not used'); },
  async register() { return { status: 'registered' }; },
  async uniqueEmail() { return { status: 'unique' }; },
};

function csrf(html: string): string {
  const token = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  if (!token) throw new Error('CSRF token not found');
  return token;
}

function cookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  return typeof header === 'string' ? [header] : header ?? [];
}

function cookieValue(response: request.Response, name: string): string {
  const cookie = cookies(response).filter((value) => value.startsWith(`${name}=`)).at(-1);
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return decodeURIComponent(cookie.split(';')[0]?.slice(name.length + 1) ?? '');
}

async function signIn(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const page = await agent.get('/login').expect(200);
  const response = await agent.post('/login').type('form').send({
    _csrf: csrf(page.text), email: 'user@example.com', password: 'password',
  }).expect(302);
  return { agent, response, originalCsrf: csrf(page.text) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('JWT browser authentication', () => {
  it('keeps the backend JWT in a nonpersistent HttpOnly cookie, without Express sessions', async () => {
    const { response, agent } = await signIn(createTestApp({
      accountClient, fetchProducts: async () => [],
    }));
    expect(cookieValue(response, 'access_token')).toBe('backend-jwt');
    for (const cookie of cookies(response)) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toMatch(/Max-Age=|Expires=/i);
      expect(cookie).not.toContain('connect.sid');
    }
    const page = await agent.get('/login').expect(302);
    expect(page.headers.location).toBe('/account');
    const home = await agent.get('/home');
    expect(home.headers['cache-control']).toBe('no-store');
    expect(home.text).not.toContain('backend-jwt');
  });

  it('sets Secure on both cookies in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECRET', secret);
    const response = await request(createApp()).get('/login').expect(200);
    expect(cookies(response)[0]).toContain('Secure');
    const tokenClient: TokenClient = {
      async getIdentity() { return { customerId: 'c1', accessLevel: 0 }; },
      async logout() {},
    };
    const login = await request(createApp({ accountClient, tokenClient })).post('/login')
      .set('Cookie', `browser_state=${encodeURIComponent(cookieValue(response, 'browser_state'))}`)
      .type('form').send({
        _csrf: csrf(response.text), email: 'user@example.com', password: 'password',
      }).expect(302);
    expect(cookies(login).find((cookie) => cookie.startsWith('access_token='))).toContain('Secure');
  });

  it.each(['', 'too-short'])('requires a strong production state-signing key: %j', (key) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECRET', key);
    expect(() => createApp()).toThrow('COOKIE_SECRET');
  });

  it('clears the old Express session cookie without trusting it', async () => {
    const response = await request(createApp()).get('/home')
      .set('Cookie', 'connect.sid=old-session').expect(302);
    expect(response.headers.location).toContain('/login');
    expect(cookies(response).some((cookie) => cookie.startsWith('connect.sid=;'))).toBe(true);
  });

  it('does not trust customer IDs, access levels or a decoded token supplied by the browser', async () => {
    const tokenClient: TokenClient = {
      async getIdentity() { return null; },
      async logout() {},
    };
    const response = await request(createApp({ tokenClient })).get('/admin/account?accessLevel=1')
      .set('Cookie', 'access_token=forged; customerId=c1; isAdmin=true').expect(302);
    expect(response.headers.location).toContain('/admin/login');
    expect(cookies(response).some((cookie) => cookie.startsWith('access_token=;'))).toBe(true);
  });

  it('does not let a verified customer access admin pages', async () => {
    const { agent } = await signIn(createTestApp({ accountClient }));
    await agent.get('/admin/account').expect(302)
      .expect('Location', '/admin/login?next=%2Fadmin%2Faccount');
  });

  it('requires verified admin access even when the admin login service reports success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tokenClient: TokenClient = {
      async getIdentity() { return { customerId: 'c1', accessLevel: 0 }; },
      async logout() {},
    };
    const agent = request.agent(createApp({
      tokenClient,
      adminAuthService: {
        async login() { return { status: 'success', accessToken: 'customer-jwt' }; },
      },
    }));
    const page = await agent.get('/admin/login');
    const response = await agent.post('/admin/login').type('form').send({
      _csrf: csrf(page.text), email: 'user@b-brilliant.com', password: 'password',
    }).expect(503);
    expect(cookies(response).some((cookie) => cookie.startsWith('access_token='))).toBe(false);
    await agent.get('/admin/account').expect(302);
  });

  it('checks identity on every authenticated request and rejects a revoked token', async () => {
    const getIdentity = vi.fn<TokenClient['getIdentity']>()
      .mockResolvedValue({ customerId: 'c1', accessLevel: 0 });
    const { agent } = await signIn(createApp({
      accountClient, tokenClient: { getIdentity, logout: vi.fn() },
    }));
    getIdentity.mockResolvedValue(null);
    await agent.get('/home').expect(302).expect('Location', '/login?returnTo=%2Fhome');
    expect(getIdentity).toHaveBeenCalledTimes(2);
    expect(getIdentity).toHaveBeenLastCalledWith('backend-jwt');
  });

  it('rejects a token whose verified subject differs from the credential response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tokenClient: TokenClient = {
      async getIdentity() { return { customerId: 'other', accessLevel: 0 }; },
      async logout() {},
    };
    const agent = request.agent(createApp({ accountClient, tokenClient }));
    const page = await agent.get('/login');
    const response = await agent.post('/login').type('form').send({
      _csrf: csrf(page.text), email: 'user@example.com', password: 'password',
    }).expect(503);
    expect(cookies(response).some((cookie) => cookie.startsWith('access_token='))).toBe(false);
    await agent.get('/home').expect(302);
  });

  it('does not authenticate an MFA-required credential response', async () => {
    const agent = request.agent(createTestApp({
      accountClient: {
        ...accountClient,
        async verifyCredentials() {
          return { status: 'valid', customerId: 'c1', mfaEnabled: true, accessToken: 'backend-jwt' };
        },
      },
    }));
    const page = await agent.get('/login');
    await agent.post('/login').type('form').send({
      _csrf: csrf(page.text), email: 'user@example.com', password: 'password',
    }).expect(401);
    await agent.get('/home').expect(302);
  });

  it('revokes logout tokens so copying the old cookie cannot restore authentication', async () => {
    const app = createTestApp({ accountClient });
    const { agent } = await signIn(app);
    const page = await agent.get('/forgot-password');
    await agent.post('/logout').type('form').send({ _csrf: csrf(page.text) }).expect(302);
    await request(app).get('/home').set('Cookie', 'access_token=backend-jwt').expect(302);
    await agent.get('/home').expect(302);
  });

  it.each(['validation', 'revocation'])('clears local authentication on logout during %s failure', async (failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getIdentity = vi.fn<TokenClient['getIdentity']>()
      .mockResolvedValue({ customerId: 'c1', accessLevel: 0 });
    const logout = vi.fn<TokenClient['logout']>().mockResolvedValue();
    const app = createApp({ accountClient, tokenClient: { getIdentity, logout } });
    const { agent, response } = await signIn(app);
    const state = jwt.decode(cookieValue(response, 'browser_state'));
    if (!state || typeof state === 'string') throw new Error('Missing browser state');
    if (failure === 'validation') getIdentity.mockRejectedValue(new Error('offline'));
    else logout.mockRejectedValue(new Error('offline'));
    const result = await agent.post('/logout').type('form').send({
      _csrf: state.csrfToken,
    }).expect(503);
    expect(result.text).toContain('could not revoke your token');
    expect(cookies(result).some((cookie) => cookie.startsWith('access_token=;'))).toBe(true);
    await agent.get('/home').expect(302);
  });

  it('fails closed with an explicit 503 when token validation is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tokenClient: TokenClient = {
      async getIdentity() { throw new Error('offline'); },
      async logout() {},
    };
    const response = await request(createApp({ tokenClient })).get('/home')
      .set('Cookie', 'access_token=backend-jwt').expect(503);
    expect(response.text).toContain('could not verify your sign-in');
    expect(cookies(response).some((cookie) => cookie.startsWith('access_token=;'))).toBe(false);
  });
});

describe('stateless CSRF and registration state', () => {
  it('does not grant onboarding when a valid progress cookie belongs to a different token', async () => {
    vi.stubEnv('COOKIE_SECRET', secret);
    const state = jwt.sign({
      csrfToken: 'a'.repeat(64), registrationTokenHash: tokenHash('other-jwt'),
    }, secret, {
      algorithm: 'HS256', issuer: 'brilliant-frontend', audience: 'browser-state', expiresIn: 7200,
    });
    const tokenClient: TokenClient = {
      async getIdentity() { return { customerId: 'c1', accessLevel: 0 }; },
      async logout() {},
    };
    await request(createApp({ tokenClient })).get('/register/details')
      .set('Cookie', `access_token=backend-jwt; browser_state=${state}`)
      .expect(302).expect('Location', '/home');
  });

  it('signs state with a separate issuer, audience and exact two-hour expiry', async () => {
    vi.stubEnv('COOKIE_SECRET', secret);
    const response = await request(createApp()).get('/login');
    const payload = jwt.verify(cookieValue(response, 'browser_state'), secret, {
      algorithms: ['HS256'], issuer: 'brilliant-frontend', audience: 'browser-state',
    });
    if (typeof payload === 'string') throw new Error('Unexpected state');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(7200);
    expect(payload.csrfToken).toBe(csrf(response.text));
    expect(payload).not.toHaveProperty('accessToken');
    expect(payload).not.toHaveProperty('customerId');
  });

  it.each(['expired', 'tampered', 'wrong-audience'])('rejects %s state and its CSRF token', async (kind) => {
    vi.stubEnv('COOKIE_SECRET', secret);
    const oldCsrf = 'a'.repeat(64);
    const cookie = jwt.sign({ csrfToken: oldCsrf, registrationTokenHash: 'forged' },
      kind === 'tampered' ? 'different-secret' : secret, {
        algorithm: 'HS256', issuer: 'brilliant-frontend',
        audience: kind === 'wrong-audience' ? 'brilliant-client' : 'browser-state',
        expiresIn: kind === 'expired' ? -1 : 7200,
      });
    await request(createApp({ accountClient })).post('/login')
      .set('Cookie', `browser_state=${cookie}`).type('form')
      .send({ _csrf: oldCsrf, email: 'user@example.com', password: 'password' }).expect(403);
  });

  it('rotates CSRF on sign-in and rejects a token copied from another browser', async () => {
    const app = createTestApp({ accountClient });
    const { agent, originalCsrf } = await signIn(app);
    await agent.post('/logout').type('form').send({ _csrf: originalCsrf }).expect(403);
    const otherBrowser = request.agent(app);
    const otherPage = await otherBrowser.get('/login');
    await agent.post('/logout').type('form').send({ _csrf: csrf(otherPage.text) }).expect(403);
  });
});
