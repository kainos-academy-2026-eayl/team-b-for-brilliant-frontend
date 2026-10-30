import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';
import { RegistrationDetailsError, type saveRegistrationDetails } from '../../services/registrationDetails';
import { stubProfileService } from '../helpers/stubProfileService';

const client: AccountClient = {
  verifyCredentials: async () => ({
    status: 'valid', customerId: 'customer-1', mfaEnabled: false, accessToken: 'private-token',
  }),
  verifyMfa: async () => { throw new Error('MFA is not used'); },
  uniqueEmail: async () => ({ status: 'unique' }),
  register: async () => ({ status: 'registered' }),
};

function token(html: string): string {
  const value = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  if (!value) throw new Error('CSRF token missing');
  return value;
}

async function signedIn(save = vi.fn<typeof saveRegistrationDetails>().mockResolvedValue()) {
  const agent = request.agent(createApp({
    accountClient: client, saveRegistrationDetails: save, fetchProducts: async () => [],
    getSecurityQuestions: async () => [{ questionID: 'q1', question: 'What is your favourite colour?' }],
    profileService: stubProfileService,
  }));
  const register = await agent.get('/register').expect(200);
  await agent.post('/register').type('form').send({
    _csrf: token(register.text), email: 'new@example.com', password: 'password123',
  }).expect(303).expect('Location', '/register/details');
  const page = await agent.get('/register/details').expect(200);
  return { agent, page, save, csrf: token(page.text) };
}

afterEach(() => vi.restoreAllMocks());

describe('optional registration details', () => {
  it('requires sign-in for viewing and submitting details', async () => {
    const agent = request.agent(createApp());
    await agent.get('/register/details').expect(302)
      .expect('Location', '/login?returnTo=%2Fregister%2Fdetails');
    const login = await agent.get('/login');
    await agent.post('/register/details').type('form')
      .send({ _csrf: token(login.text), firstname: 'Jane' }).expect(302);
  });

  it('renders schema fields through the shared layout without leaking the backend token', async () => {
    const { page } = await signedIn();
    for (const field of ['firstname', 'surname', 'addressLine1', 'addressLine2', 'postcode']) {
      expect(page.text).toContain(`name="${field}"`);
    }
    expect(page.text.match(/<header\b/g)).toHaveLength(1);
    expect(page.text.match(/id="site-menu"/g)).toHaveLength(1);
    expect(page.text).toContain('action="/register/details/skip"');
    expect(page.text).toContain('class="button button-link">Skip for now');
    expect(page.text).not.toContain('private-token');
    expect(page.text).not.toContain('name="roleID"');
    expect(page.text).toContain('name="securityAnswer"');
    expect(page.text).toContain('name="securityQuestionID"');
  });

  it('saves trimmed details using the server-side token, then redirects home', async () => {
    const { agent, save, csrf } = await signedIn();
    await agent.post('/register/details').type('form').send({
      _csrf: csrf, firstname: ' Jane ', surname: 'Smith', addressLine1: '1 Main Street',
      postcode: 'BT1 1AA', customerID: 'someone-else', accountToken: 'forged-token',
    }).expect(303).expect('Location', '/home');
    expect(save).toHaveBeenCalledExactlyOnceWith('private-token', {
      firstname: 'Jane', surname: 'Smith', addressLine1: '1 Main Street',
      addressLine2: '', postcode: 'BT1 1AA',
    });
    await agent.get('/account').expect(200);
  });

  it('allows skipping without any save request and keeps the customer signed in', async () => {
    const { agent, save, csrf } = await signedIn();
    await agent.post('/register/details/skip').type('form')
      .send({ _csrf: csrf }).expect(303).expect('Location', '/home');
    await agent.get('/home').expect(200);
    expect(save).not.toHaveBeenCalled();
    await agent.get('/account').expect(200);
  });

  it('accepts empty optional fields', async () => {
    const { agent, csrf, save } = await signedIn();
    await agent.post('/register/details').type('form')
      .send({ _csrf: csrf }).expect(303).expect('Location', '/home');
    expect(save).toHaveBeenCalledWith('private-token', {
      firstname: '', surname: '', addressLine1: '', addressLine2: '', postcode: '',
    });
  });

  it('blocks both viewing and saving after ordinary sign-in, even with a forged onboarding flag', async () => {
    const save = vi.fn<typeof saveRegistrationDetails>().mockResolvedValue();
    const agent = request.agent(createApp({
      accountClient: client, saveRegistrationDetails: save,
      profileService: stubProfileService,
    }));
    const login = await agent.get('/login').expect(200);
    await agent.post('/login').type('form').send({
      _csrf: token(login.text), email: 'user@example.com', password: 'password123',
    }).expect(302);
    await agent.get('/register/details?registrationDetailsPending=true')
      .expect(302).expect('Location', '/home');
    const page = await agent.get('/account').expect(200);
    await agent.post('/register/details').type('form').send({
      _csrf: token(page.text), firstname: 'Jane', registrationDetailsPending: true,
    }).expect(302).expect('Location', '/home');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects invalid details and preserves values with field errors', async () => {
    const { agent, csrf, save } = await signedIn();
    const response = await agent.post('/register/details').type('form')
      .send({ _csrf: csrf, firstname: 'x'.repeat(101), surname: 'Smith' }).expect(400);
    expect(response.text).toContain('First name must be 100 characters or fewer.');
    expect(response.text).toContain('aria-invalid="true"');
    expect(response.text).toContain('value="Smith"');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a missing CSRF token before saving', async () => {
    const { agent, save } = await signedIn();
    await agent.post('/register/details').type('form').send({ firstname: 'Jane' }).expect(403);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([401, 500])('shows an explicit upstream %s error while allowing retry or skip', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, csrf } = await signedIn(
      vi.fn<typeof saveRegistrationDetails>().mockRejectedValue(new RegistrationDetailsError(status)),
    );
    const response = await agent.post('/register/details').type('form')
      .send({ _csrf: csrf, firstname: 'Jane' }).expect(status === 401 ? 401 : 503);
    expect(response.text).toContain('value="Jane"');
    expect(response.text).toContain(status === 401 ? 'sign-in has expired' : 'We could not save');
    expect(response.text).toContain('Skip for now');
  });

  it.each(['save', 'skip'] as const)('blocks revisiting and replaying the form after %s', async (action) => {
    const { agent, save, csrf } = await signedIn();
    const body = { _csrf: csrf, firstname: 'Jane' };
    await agent.post(action === 'save' ? '/register/details' : '/register/details/skip')
      .type('form').send(body).expect(303).expect('Location', '/home');

    await agent.get('/register/details').expect(302).expect('Location', '/home');
    await agent.post('/register/details').type('form')
      .send({ _csrf: csrf, firstname: '', surname: '' })
      .expect(302).expect('Location', '/home');
    await agent.post('/register/details/skip').type('form')
      .send({ _csrf: csrf }).expect(302).expect('Location', '/home');
    expect(save).toHaveBeenCalledTimes(action === 'save' ? 1 : 0);
    await agent.get('/account').expect(200);
  });

  it('keeps onboarding available after validation fails', async () => {
    const { agent, save, csrf } = await signedIn();
    await agent.post('/register/details').type('form')
      .send({ _csrf: csrf, firstname: 'x'.repeat(101) }).expect(400);
    await agent.get('/register/details').expect(200);
    expect(save).not.toHaveBeenCalled();
    await agent.post('/register/details').type('form')
      .send({ _csrf: csrf, firstname: 'Jane' }).expect(303);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps onboarding available after a save failure, then consumes it on successful retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi.fn<typeof saveRegistrationDetails>()
      .mockRejectedValueOnce(new RegistrationDetailsError(500))
      .mockResolvedValue();
    const { agent, csrf } = await signedIn(save);
    const body = { _csrf: csrf, firstname: 'Jane' };
    await agent.post('/register/details').type('form').send(body).expect(503);
    await agent.get('/register/details').expect(200);
    await agent.post('/register/details').type('form').send(body).expect(303);
    await agent.get('/register/details').expect(302).expect('Location', '/home');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('rejects skipping without CSRF and leaves onboarding available', async () => {
    const { agent, save, csrf } = await signedIn();
    await agent.post('/register/details/skip').type('form').send({}).expect(403);
    await agent.get('/register/details').expect(200);
    await agent.post('/register/details/skip').type('form')
      .send({ _csrf: csrf }).expect(303);
    expect(save).not.toHaveBeenCalled();
  });
});
