import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';
import { stubProfileService } from '../helpers/stubProfileService';

function csrf(html: string): string {
  const token = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  if (!token) throw new Error('CSRF token missing');
  return token;
}

async function failedAutomaticSignIn() {
  const client = {
    uniqueEmail: vi.fn<AccountClient['uniqueEmail']>().mockResolvedValue({ status: 'unique' }),
    register: vi.fn<AccountClient['register']>().mockResolvedValue({ status: 'registered' }),
    verifyCredentials: vi.fn<AccountClient['verifyCredentials']>()
      .mockResolvedValueOnce({ status: 'not_found' })
      .mockResolvedValue({
        status: 'valid', customerId: 'customer-1', mfaEnabled: false, accessToken: 'test-token',
      }),
    verifyMfa: vi.fn<AccountClient['verifyMfa']>()
      .mockRejectedValue(new Error('MFA is not used')),
  } satisfies AccountClient;
  const save = vi.fn().mockResolvedValue(undefined);
  const agent = request.agent(createApp({
    accountClient: client, saveRegistrationDetails: save, fetchProducts: async () => [],
    getSecurityQuestions: async () => [],
    profileService: stubProfileService,
  }));
  const page = await agent.get('/register').expect(200);
  const response = await agent.post('/register').type('form').send({
    _csrf: csrf(page.text), email: 'Mixed.Case@Example.com', password: 'Password123',
  }).expect(401);
  return { agent, client, save, response };
}

afterEach(() => vi.restoreAllMocks());

describe('registration sign-in recovery', () => {
  it('does not show a success banner alongside the automatic sign-in failure', async () => {
    const { response } = await failedAutomaticSignIn();
    expect(response.text).toContain('automatic sign-in failed');
    expect(response.text).not.toContain('id="success-message"');
    expect(response.text).toContain('href="/login"');
  });

  it('resumes onboarding when the registered email signs in successfully in the same session', async () => {
    const { agent, client } = await failedAutomaticSignIn();
    const login = await agent.get('/login').expect(200);
    await agent.post('/login').type('form').send({
      _csrf: csrf(login.text), email: 'mixed.case@example.com', password: 'Password123',
    }).expect(302).expect('Location', '/register/details');
    const details = await agent.get('/register/details').expect(200);
    expect(details.text).toContain('Add your details');
    expect(client.register).toHaveBeenCalledTimes(1);
    await agent.get('/account').expect(200);
  });

  it('does not grant onboarding to a different account', async () => {
    const { agent, save } = await failedAutomaticSignIn();
    const login = await agent.get('/login').expect(200);
    await agent.post('/login').type('form').send({
      _csrf: csrf(login.text), email: 'other@example.com', password: 'Password123',
    }).expect(302).expect('Location', '/home');
    await agent.get('/register/details').expect(302).expect('Location', '/home');
    const account = await agent.get('/account').expect(200);
    await agent.post('/register/details').type('form').send({
      _csrf: csrf(account.text), firstname: 'Unexpected',
    }).expect(302).expect('Location', '/home');
    expect(save).not.toHaveBeenCalled();
  });

  it('retains the recovery context through unsuccessful manual sign-in attempts', async () => {
    const { agent, client } = await failedAutomaticSignIn();
    client.verifyCredentials.mockResolvedValueOnce({ status: 'invalid' });
    const login = await agent.get('/login').expect(200);
    await agent.post('/login').type('form').send({
      _csrf: csrf(login.text), email: 'mixed.case@example.com', password: 'wrong-password',
    }).expect(401);
    await agent.post('/login').type('form').send({
      _csrf: csrf(login.text), email: 'mixed.case@example.com', password: 'Password123',
    }).expect(302).expect('Location', '/register/details');
  });

  it('does not reopen completed onboarding on a later sign-in', async () => {
    const { agent } = await failedAutomaticSignIn();
    const login = await agent.get('/login').expect(200);
    await agent.post('/login').type('form').send({
      _csrf: csrf(login.text), email: 'mixed.case@example.com', password: 'Password123',
    }).expect(302);
    const details = await agent.get('/register/details').expect(200);
    await agent.post('/register/details/skip').type('form')
      .send({ _csrf: csrf(details.text) }).expect(303);
    const account = await agent.get('/account').expect(200);
    await agent.post('/logout').type('form').send({ _csrf: csrf(account.text) }).expect(302);
    const signInAgain = await agent.get('/login').expect(200);
    await agent.post('/login').type('form').send({
      _csrf: csrf(signInAgain.text), email: 'mixed.case@example.com', password: 'Password123',
    }).expect(302).expect('Location', '/home');
    await agent.get('/register/details').expect(302).expect('Location', '/home');
  });
});
