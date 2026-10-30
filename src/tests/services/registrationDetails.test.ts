import { afterEach, expect, it, vi } from 'vitest';
import { RegistrationDetailsError, saveRegistrationDetails } from '../../services/registrationDetails';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('sends only profile data to the backend with server-side bearer authentication', async () => {
  vi.stubEnv('CUSTOMER_ACCOUNT_SERVICE_URL', 'http://backend.test');
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  const details = { firstname: 'Jane', surname: '', addressLine1: '', addressLine2: '', postcode: '' };
  await saveRegistrationDetails('private-token', details);
  expect(fetchMock).toHaveBeenCalledWith('http://backend.test/account/details', expect.objectContaining({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer private-token' },
    body: JSON.stringify(details),
  }));
});

it('surfaces backend failures rather than pretending details were saved', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, { status: 500 }),
  ));
  await expect(saveRegistrationDetails('token', {
    firstname: '', surname: '', addressLine1: '', addressLine2: '', postcode: '',
  })).rejects.toBeInstanceOf(RegistrationDetailsError);
});
