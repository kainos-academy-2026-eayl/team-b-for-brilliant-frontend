import type { RegistrationDetails } from '../schemas/registrationDetails';

export class RegistrationDetailsError extends Error {
  constructor(readonly status: number) {
    super(`Account details service responded ${status}`);
  }
}

export async function saveRegistrationDetails(
  token: string,
  details: RegistrationDetails,
): Promise<void> {
  const baseUrl = process.env.CUSTOMER_ACCOUNT_SERVICE_URL ?? '';
  const response = await fetch(`${baseUrl}/account/details`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(details),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new RegistrationDetailsError(response.status);
}
