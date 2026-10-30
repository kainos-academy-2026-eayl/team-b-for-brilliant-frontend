import { z } from 'zod';
import type { RegistrationDetails } from '../schemas/registrationDetails';

const securityQuestionsSchema = z.object({
  questions: z.array(z.object({
    questionID: z.string().min(1),
    question: z.string().min(1),
  })),
});

export type SecurityQuestion = z.infer<typeof securityQuestionsSchema>['questions'][number];

export class RegistrationDetailsError extends Error {
  constructor(readonly status: number) {
    super(`Account details service responded ${status}`);
  }
}

export async function getSecurityQuestions(token: string): Promise<SecurityQuestion[]> {
  const baseUrl = process.env.CUSTOMER_ACCOUNT_SERVICE_URL ?? '';
  const response = await fetch(`${baseUrl}/account/security-questions`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new RegistrationDetailsError(response.status);
  return securityQuestionsSchema.parse(await response.json()).questions;
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
