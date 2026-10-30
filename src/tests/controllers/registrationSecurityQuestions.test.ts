import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';
import { getSecurityQuestions, RegistrationDetailsError, type saveRegistrationDetails } from '../../services/registrationDetails';

const questions = [{ questionID: 'q1', question: 'What is your favourite colour?' }];
const accountClient: AccountClient = {
  verifyCredentials: async () => ({
    status: 'valid', customerId: 'customer-1', mfaEnabled: false, accessToken: 'test-token',
  }),
  verifyMfa: async () => { throw new Error('MFA is not used'); },
  uniqueEmail: async () => ({ status: 'unique' }),
  register: async () => ({ status: 'registered' }),
};

function csrf(html: string): string {
  const value = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  if (!value) throw new Error('CSRF token missing');
  return value;
}

async function registered(
  load = vi.fn<typeof getSecurityQuestions>().mockResolvedValue(questions),
) {
  const save = vi.fn<typeof saveRegistrationDetails>().mockResolvedValue();
  const agent = request.agent(createApp({
    accountClient, saveRegistrationDetails: save, getSecurityQuestions: load,
  }));
  const form = await agent.get('/register').expect(200);
  await agent.post('/register').type('form').send({
    _csrf: csrf(form.text), email: 'new@example.com', password: 'password123',
  }).expect(303);
  return { agent, save, load };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('optional security questions', () => {
  it('loads the database choices into an accessible dropdown', async () => {
    const { agent, load } = await registered();
    const page = await agent.get('/register/details').expect(200);
    expect(page.text).toContain('<option value="q1">What is your favourite colour?</option>');
    expect(page.text).toContain('label for="securityQuestionID"');
    expect(page.text).toContain('id="securityAnswer"');
    expect(page.text).toContain('type="password"');
    expect(load).toHaveBeenCalledWith('test-token');
  });

  it.each(['', '   '])('omits both security fields when the answer is blank (%j)', async (answer) => {
    const { agent, save } = await registered();
    const page = await agent.get('/register/details').expect(200);
    await agent.post('/register/details').type('form').send({
      _csrf: csrf(page.text), firstname: 'Jane', securityQuestionID: 'q1', securityAnswer: answer,
    }).expect(303);
    expect(save).toHaveBeenCalledWith('test-token', {
      firstname: 'Jane', surname: '', addressLine1: '', addressLine2: '', postcode: '',
    });
  });

  it('sends the chosen ID and trimmed answer when both are supplied', async () => {
    const { agent, save } = await registered();
    const page = await agent.get('/register/details').expect(200);
    await agent.post('/register/details').type('form').send({
      _csrf: csrf(page.text), securityQuestionID: 'q1', securityAnswer: ' Blue ',
    }).expect(303);
    expect(save).toHaveBeenCalledWith('test-token', expect.objectContaining({
      securityQuestionID: 'q1', securityAnswer: 'Blue',
    }));
  });

  it('requires a question for a nonblank answer and does not echo the answer on error', async () => {
    const { agent, save } = await registered();
    const page = await agent.get('/register/details').expect(200);
    const error = await agent.post('/register/details').type('form').send({
      _csrf: csrf(page.text), securityAnswer: 'VeryPrivateAnswer',
    }).expect(400);
    expect(error.text).toContain('Select a security question when providing an answer.');
    expect(error.text).toContain('<option value="q1">');
    expect(error.text).not.toContain('VeryPrivateAnswer');
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the selected question after a rejected save and requires the answer to be re-entered', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, save } = await registered();
    save.mockRejectedValue(new RegistrationDetailsError(400));
    const page = await agent.get('/register/details').expect(200);
    const error = await agent.post('/register/details').type('form').send({
      _csrf: csrf(page.text), securityQuestionID: 'q1', securityAnswer: 'VeryPrivateAnswer',
    }).expect(400);
    expect(error.text).toContain('value="q1" selected');
    expect(error.text).not.toContain('VeryPrivateAnswer');
    expect(error.text).toContain('re-enter your answer');
  });

  it('shows load failures explicitly and still allows skipping without saving', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, save } = await registered(
      vi.fn<typeof getSecurityQuestions>().mockRejectedValue(new Error('Unavailable')),
    );
    const page = await agent.get('/register/details').expect(503);
    expect(page.text).toContain('We could not load the security questions.');
    expect(page.text).not.toContain('action="/register/details"');
    await agent.post('/register/details/skip').type('form')
      .send({ _csrf: csrf(page.text) }).expect(303);
    expect(save).not.toHaveBeenCalled();
  });

  it('allows profile-only submission when no questions exist', async () => {
    const { agent, save } = await registered(
      vi.fn<typeof getSecurityQuestions>().mockResolvedValue([]),
    );
    const page = await agent.get('/register/details').expect(200);
    expect(page.text).toContain('No security questions are available.');
    await agent.post('/register/details').type('form')
      .send({ _csrf: csrf(page.text), firstname: 'Jane' }).expect(303);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

it('reads the question API contract with bearer authentication and rejects malformed responses', async () => {
  vi.stubEnv('CUSTOMER_ACCOUNT_SERVICE_URL', 'http://backend.test');
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ questions }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(getSecurityQuestions('test-token')).resolves.toEqual(questions);
  expect(fetchMock).toHaveBeenCalledWith('http://backend.test/account/security-questions',
    expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }));
  fetchMock.mockResolvedValue(Response.json({ questions: [{ questionID: 'q1' }] }));
  await expect(getSecurityQuestions('test-token')).rejects.toThrow();
});
