import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';

const accountClient: AccountClient = {
  async uniqueEmail() {
    throw new Error('Email uniqueness should not be checked during login');
  },
  async register() {
    throw new Error('Registration should not run during login');
  },
  async verifyCredentials(email, password,) {
    return email === 'jane@example.com' && password === 'correct'
      ? { status: 'valid', customerId: 'c1', mfaEnabled: false }
      : { status: 'invalid' };
  },
  async verifyMfa() {
    throw new Error('MFA verification should not run when MFA is disabled');
  },
};

type Agent = ReturnType<typeof request.agent>;

function extractToken(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('CSRF token not found');
  return match[1];
}

async function csrf(agent: Agent, path = '/login') {
  return extractToken((await agent.get(path)).text);
}

describe('login flow', () => {
  it('signs in and lands on the home page', async () => {
    const agent = request.agent(createApp({ accountClient }));
    const token = await csrf(agent);

    const res = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'jane@example.com', password: 'correct' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/home');
    expect((await agent.get('/account')).status).toBe(200);
  });

  it('shows the same generic error for any bad credential', async () => {
    const agent = request.agent(createApp({ accountClient }));
    const token = await csrf(agent);

    const badEmail = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'nobody@example.com', password: 'correct' });
    const badPassword = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'jane@example.com', password: 'wrong' });

    expect(badEmail.status).toBe(401);
    expect(badPassword.status).toBe(401);
    expect(badEmail.text).toContain('Email or password is incorrect');
    expect(badPassword.text).toContain('Email or password is incorrect');
  });

  it('rejects a POST without a valid CSRF token', async () => {
    const agent = request.agent(createApp({ accountClient }));
    await agent.get('/login');

    const res = await agent
      .post('/login')
      .type('form')
      .send({ email: 'jane@example.com', password: 'correct' });

    expect(res.status).toBe(403);
  });

  it('blocks the 6th attempt after 5 failures', async () => {
    const agent = request.agent(createApp({ accountClient }));
    const token = await csrf(agent);
    const attempt = () =>
      agent
        .post('/login')
        .type('form')
        .send({ _csrf: token, email: 'jane@example.com', password: 'wrong' });

    for (let i = 0; i < 5; i++) await attempt();
    const res = await attempt();

    expect(res.status).toBe(429);
    expect(res.text).toContain('Too many failed attempts');
  });

  it('logs out and ends the session', async () => {
    const agent = request.agent(createApp({ accountClient }));
    const loginToken = await csrf(agent);
    await agent.post('/login').type('form').send({
      _csrf: loginToken,
      email: 'jane@example.com',
      password: 'correct',
    });

    const logoutToken = await csrf(agent, '/account');
    await agent.post('/logout').type('form').send({ _csrf: logoutToken });

    const res = await agent.get('/account');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('redirects unauthenticated users to login with returnTo', async () => {
    const res = await request(createApp({ accountClient })).get('/account');
    expect(res.headers.location).toBe('/login?returnTo=%2Faccount');
  });
});
