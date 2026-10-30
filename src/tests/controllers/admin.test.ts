import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { AdminAuthService } from '../../services/adminAuthService';

const adminAuthService: AdminAuthService = {
  async login(_email, password) {
    return password === 'correct'
      ? { status: 'success' }
      : { status: 'invalid' };
  },
};

function extractToken(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('CSRF token not found');
  return match[1];
}

async function signInAsAdmin() {
  const agent = request.agent(createApp({ adminAuthService }));
  const token = extractToken((await agent.get('/admin/login')).text);
  const response = await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: token, email: 'a@b-brilliant.com', password: 'correct' });
  return { agent, response };
}

describe('admin pages', () => {
  it('shows the sign-in form', async () => {
    const response = await request(createApp({ adminAuthService })).get(
      '/admin/login',
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain('action="/admin/login"');
  });

  it('redirects signed-out visitors from the account page to sign in', async () => {
    const response = await request(createApp({ adminAuthService })).get(
      '/admin/account',
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      '/admin/login?next=%2Fadmin%2Faccount',
    );
  });

  it('rejects an email outside the company domain', async () => {
    const agent = request.agent(createApp({ adminAuthService }));
    const token = extractToken((await agent.get('/admin/login')).text);
    const response = await agent
      .post('/admin/login')
      .type('form')
      .send({ _csrf: token, email: 'a@gmail.com', password: 'correct' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Use your company email address.');
  });

  it('shows an error for the wrong password', async () => {
    const agent = request.agent(createApp({ adminAuthService }));
    const token = extractToken((await agent.get('/admin/login')).text);
    const response = await agent
      .post('/admin/login')
      .type('form')
      .send({ _csrf: token, email: 'a@b-brilliant.com', password: 'nope' });

    expect(response.status).toBe(401);
    expect(response.text).toContain('Invalid email or password.');
  });

  it('signs in, shows the account page, then logs out', async () => {
    const { agent, response } = await signInAsAdmin();
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/admin/account');

    const account = await agent.get('/admin/account');
    expect(account.status).toBe(200);
    expect(account.text).toContain('action="/admin/account/logout"');

    const logout = await agent
      .post('/admin/account/logout')
      .type('form')
      .send({ _csrf: extractToken(account.text) });
    expect(logout.headers.location).toBe('/admin/login');

    expect((await agent.get('/admin/account')).status).toBe(302);
  });
});
