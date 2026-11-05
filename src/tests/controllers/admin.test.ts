import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp as createApp } from '../helpers/createTestApp';
import type { AccountClient } from '../../clients/accountClient';

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

async function signIn(accessLevel: 0 | 1) {
  const agent = request.agent(createApp({ accountClient, fetchProducts: async () => [] }, accessLevel));
  const token = extractToken((await agent.get('/login')).text);
  const response = await agent
    .post('/login')
    .type('form')
    .send({ _csrf: token, email: 'user@example.com', password: 'correct', returnTo: '/admin/account' });
  return { agent, response };
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

  it.each(['/admin/account', '/products/add'])('redirects signed-out visitors from %s to a public home page', async (path) => {
    const app = createApp({ fetchProducts: async () => [] });
    await request(app).get(path).expect(302).expect('Location', '/home');
    const home = await request(app).get(path).redirects(1).expect(200);
    expect(home.text).toContain('Featured products');
    expect(home.text).toContain('href="/login"');
    expect(home.text).not.toContain('href="/products/add"');
  });

  it('redirects the site root to the public home page', async () => {
    await request(createApp()).get('/').expect(302).expect('Location', '/home');
  });

  it('redirects signed-out admin-account submissions home without signing in', async () => {
    const agent = request.agent(createApp());
    const page = await agent.get('/login');
    await agent.post('/admin/account/logout').type('form')
      .send({ _csrf: extractToken(page.text) }).expect(302).expect('Location', '/home');
  });

  it.each(['/admin/account', '/products/add'])('redirects verified customers from %s without granting admin access', async (path) => {
    const { agent } = await signIn(0);
    await agent.get(path).expect(302).expect('Location', '/home');
    const home = await agent.get('/home').expect(200);
    expect(home.text).not.toContain('href="/products/add"');
    await agent.post('/admin/account/logout').type('form')
      .send({ _csrf: extractToken(home.text) }).expect(302).expect('Location', '/home');
    await agent.get('/login').expect(302).expect('Location', '/account');
  });

  it('signs admins in through standard login, then logs out to the public home page', async () => {
    const { agent, response } = await signIn(1);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/admin/account');

    const account = await agent.get('/admin/account');
    expect(account.status).toBe(200);
    expect(account.text).toContain('action="/admin/account/logout"');

    const logout = await agent
      .post('/admin/account/logout')
      .type('form')
      .send({ _csrf: extractToken(account.text) });
    expect(logout.headers.location).toBe('/home');

    await agent.get('/admin/account').expect(302).expect('Location', '/home');
    const home = await agent.get('/home').expect(200);
    expect(home.text).toContain('href="/login"');
    expect(home.text).not.toContain('href="/products/add"');
  });
});
