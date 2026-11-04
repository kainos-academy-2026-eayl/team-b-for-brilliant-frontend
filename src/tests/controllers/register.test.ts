import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';
import { stubProfileService } from '../helpers/stubProfileService';

function registrationClient() {
  return {
    verifyCredentials: vi.fn<AccountClient['verifyCredentials']>()
      .mockResolvedValue({
        status: 'valid', customerId: 'new-customer', mfaEnabled: false, accessToken: 'account-token',
      }),
    verifyMfa: vi.fn<AccountClient['verifyMfa']>()
      .mockRejectedValue(new Error('MFA should not run during registration')),
    uniqueEmail: vi.fn<AccountClient['uniqueEmail']>()
      .mockResolvedValue({ status: 'unique' }),
    register: vi.fn<AccountClient['register']>()
      .mockResolvedValue({ status: 'registered' }),
  } satisfies AccountClient;
}

async function registrationForm(accountClient: AccountClient) {
  const agent = request.agent(createApp({
    accountClient, getSecurityQuestions: async () => [],
    profileService: stubProfileService,
  }));
  const page = await agent.get('/register').expect(200);
  const token = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1];
  if (!token) throw new Error('Registration CSRF token not found');
  return {
    agent,
    page,
    body: {
      _csrf: token,
      email: 'new@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('registration flow', () => {
  it('renders the shared layout and a protected server-handled form', async () => {
    const { page } = await registrationForm(registrationClient());
    expect(page.text).toContain('action="/register"');
    expect(page.text).not.toContain('src="/register.js"');
    expect(page.text.match(/<header\b/g)).toHaveLength(1);
    expect(page.text.match(/id="site-menu"/g)).toHaveLength(1);
    expect(page.text).not.toContain('Check your email');
    expect(page.text.match(/role="alert"/g)).toHaveLength(1);
    expect(page.text.match(/aria-describedby="form-error"/g)).toHaveLength(3);
    expect(page.text).not.toContain('class="field-error"');
  });

  it.each([
    {
      name: 'invalid email',
      fields: { email: 'invalid' },
      error: 'Email or password is incorrect. Please try again.',
    },
    {
      name: 'missing password',
      fields: { password: '' },
      error: 'Email or password is incorrect. Please try again.',
    },
    {
      name: 'mismatched passwords',
      fields: { confirmPassword: 'different-password' },
      error: 'Email or password is incorrect. Please try again.',
    },
  ])('renders $name in the shared error element', async ({ fields, error }) => {
    const client = registrationClient();
    const { agent, body } = await registrationForm(client);
    const response = await agent.post('/register').type('form')
      .send({ ...body, ...fields }).expect(401);

    expect(response.text).toContain(`<div id="form-error" class="alert" role="alert">${error}</div>`);
    expect(response.text.match(/role="alert"/g)).toHaveLength(1);
    expect(client.uniqueEmail).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it.each([7, 17])('rejects a %i-character password in the shared error element', async (length) => {
    const client = registrationClient();
    const { agent, body } = await registrationForm(client);
    const password = 'a'.repeat(length);
    const response = await agent.post('/register').type('form')
      .send({ ...body, password, confirmPassword: password }).expect(401);

    expect(response.text).toContain('<div id="form-error" class="alert" role="alert">Email or password is incorrect. Please try again.</div>');
    expect(client.uniqueEmail).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it.each([8, 11, 16])('signs the customer in with a %i-character password and redirects to optional details', async (length) => {
    const client = registrationClient();
    const { agent, body } = await registrationForm(client);
    body.password = 'a'.repeat(length);
    body.confirmPassword = body.password;
    const response = await agent.post('/register').type('form').send(body).expect(303);
    const location = response.headers.location;
    if (!location) throw new Error('Registration confirmation redirect not found');
    expect(location).toBe('/register/details');
    expect(client.register).toHaveBeenCalledExactlyOnceWith(body.email, body.password);

    const confirmation = await agent.get(location).expect(200);
    expect(confirmation.text).toContain('Add your details');
    expect(confirmation.text).toContain('Skip for now');
    expect(confirmation.text).not.toContain('id="register-form"');
    await agent.get(location).expect(200);
    expect(client.register).toHaveBeenCalledTimes(1);
    await agent.get('/account').expect(200);
  });

  it('renders an existing-email error without attempting account creation', async () => {
    const client = registrationClient();
    client.uniqueEmail.mockResolvedValue({ status: 'not_unique' });
    const { agent, body } = await registrationForm(client);
    const response = await agent.post('/register').type('form').send(body).expect(409);
    expect(response.text).toContain('<div id="form-error" class="alert" role="alert">Email or password is incorrect. Please try again.</div>');
    expect(response.text).not.toContain('An account with this email address already exists');
    expect(response.text).toContain('value="new@example.com"');
    expect(response.text).not.toContain('Too many failed attempts');
    expect(client.register).not.toHaveBeenCalled();
  });

  it.each(['uniqueEmail', 'register'] as const)('renders service errors from %s without showing success', async (method) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = registrationClient();
    client[method].mockRejectedValue(new Error('Account service unavailable'));
    const { agent, body } = await registrationForm(client);
    const response = await agent.post('/register').type('form').send(body).expect(503);
    expect(response.text).toContain('<div id="form-error" class="alert" role="alert">We could not register your account right now. Please try again later.</div>');
    expect(response.text).not.toContain('Registration request processed.');
    expect(log).toHaveBeenCalledWith('Account service call failed', 'Account service unavailable');
    if (method === 'uniqueEmail') expect(client.register).not.toHaveBeenCalled();
  });

  it('renders a conflict detected during creation without signing in or redirecting', async () => {
    const client = registrationClient();
    client.register.mockResolvedValue({ status: 'existing' });
    const { agent, body } = await registrationForm(client);
    const response = await agent.post('/register').type('form').send(body).expect(409);

    expect(response.text).toContain('<div id="form-error" class="alert" role="alert">Email or password is incorrect. Please try again.</div>');
    expect(response.text).not.toContain('An account with this email address already exists');
    expect(response.headers.location).toBeUndefined();
    expect(client.register).toHaveBeenCalledExactlyOnceWith(body.email, body.password);
    expect(client.verifyCredentials).not.toHaveBeenCalled();
    await agent.get('/account').expect(302);
  });

  it('rejects missing CSRF tokens before calling the backend', async () => {
    const client = registrationClient();
    const { agent } = await registrationForm(client);
    await agent.post('/register').type('form')
      .send({ email: 'new@example.com', password: 'password123' }).expect(403);
    expect(client.uniqueEmail).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });
});
