import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp as createApp } from '../helpers/createTestApp';
import type { AccountClient } from '../../clients/accountClient';
import type { ProfileService } from '../../services/profileService';
import { stubProfileService } from '../helpers/stubProfileService';

const accountClient: AccountClient = {
  async verifyCredentials(_email, password) {
    return password === 'correct'
      ? { status: 'valid', customerId: 'user-1', accessToken: 'user-token' }
      : { status: 'invalid' };
  },
  async register() { throw new Error('Registration is not used in admin tests'); },
  async uniqueEmail() { throw new Error('Email uniqueness is not used in admin tests'); },
};

function extractToken(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('CSRF token not found');
  return match[1];
}

async function signIn(accessLevel: 0 | 1, profileService: ProfileService = stubProfileService) {
  const app = createApp({ accountClient, fetchProducts: async () => [], profileService }, accessLevel);
  const agent = request.agent(app);
  const token = extractToken((await agent.get('/login')).text);
  const response = await agent
    .post('/login')
    .type('form')
    .send({ _csrf: token, email: 'user@example.com', password: 'correct', returnTo: '/account' });
  return { app, agent, response };
}

describe('admin pages', () => {
  it('removes the dedicated admin sign-in routes', async () => {
    const agent = request.agent(createApp());
    await agent.get('/admin/login').expect(404);
    const page = await agent.get('/login');
    await agent.post('/admin/login').type('form')
      .send({ _csrf: extractToken(page.text), email: 'user@example.com', password: 'correct' })
      .expect(404);
  });

  it('removes the dedicated admin account and logout routes', async () => {
    const agent = request.agent(createApp());
    await agent.get('/admin/account').expect(404);
    const page = await agent.get('/login');
    await agent.post('/admin/account/logout').type('form')
      .send({ _csrf: extractToken(page.text) }).expect(404);
  });

  it('redirects signed-out visitors from product creation to the public home page', async () => {
    const app = createApp({ fetchProducts: async () => [] });
    await request(app).get('/products/add').expect(302).expect('Location', '/home');
    const home = await request(app).get('/products/add').redirects(1).expect(200);
    expect(home.text).toContain('Featured products');
    expect(home.text).toContain('href="/login"');
    expect(home.text).not.toContain('href="/products/add"');
  });

  it('redirects the site root to the public home page', async () => {
    await request(createApp()).get('/').expect(302).expect('Location', '/home');
  });

  it('keeps product creation admin-only on the shared account flow', async () => {
    const { agent } = await signIn(0);
    await agent.get('/products/add').expect(302).expect('Location', '/home');
    const home = await agent.get('/home').expect(200);
    expect(home.text).not.toContain('href="/products/add"');
    await agent.get('/login').expect(302).expect('Location', '/account');
  });

  it.each([0, 1] as const)('uses the same account page and logout for access level %s', async (accessLevel) => {
    const { app, agent, response } = await signIn(accessLevel);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/account');

    const account = await agent.get('/account');
    expect(account.status).toBe(200);
    expect(account.text).toContain('action="/account"');
    expect(account.text).toContain('action="/logout"');
    expect(account.text).not.toContain('/admin/account');
    expect(account.text).toContain('Hello Jane!');
    expect(account.text.match(/<header\b/g)).toHaveLength(1);
    expect(account.text.match(/id="site-menu"/g)).toHaveLength(1);
    expect(account.text.includes('<p><a href="/products/add">Create product</a></p>')).toBe(accessLevel === 1);
    await agent.get('/admin/account').expect(404);
    await agent.post('/admin/account/logout').type('form')
      .send({ _csrf: extractToken(account.text) }).expect(404);

    const logout = await agent
      .post('/logout')
      .type('form')
      .send({ _csrf: extractToken(account.text) });
    expect(logout.headers.location).toBe('/login');

    await agent.get('/account').expect(302).expect('Location', '/login?returnTo=%2Faccount');
    await request(app).get('/account').set('Cookie', 'access_token=user-token').expect(302);
    await agent.get('/products/add').expect(302).expect('Location', '/home');
  });

  it('lets admins save their profile through the shared account endpoint', async () => {
    const updateProfile = vi.fn<ProfileService['updateProfile']>(async (_token, input) => ({
      ...await stubProfileService.getProfile('user-token'), ...input,
    }));
    const { agent } = await signIn(1, { ...stubProfileService, updateProfile });
    const account = await agent.get('/account').expect(200);
    const values = {
      firstname: 'Admin', surname: 'User', addressLine1: '1 High Street',
      addressLine2: '', postcode: 'BT7 1NT',
    };
    await agent.post('/account').type('form')
      .send({ ...values, _csrf: extractToken(account.text) }).expect(302).expect('Location', '/account?saved=1');
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith('user-token', values);
  });
});
