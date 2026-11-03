import { z } from 'zod';
import { passwordOnlyAuthSchema } from '../schemas/passwordOnlyAuth';

const uniqueEmailResponseSchema = z.object({ unique: z.boolean() });
const verifyResponseSchema = passwordOnlyAuthSchema.extend({
  customerId: z.string().min(1),
  accessToken: z.string().min(1),
});

export type VerifyResult =
  | { status: 'valid'; customerId: string; accessToken: string; }
  | { status: 'invalid'; }
  | { status: 'not_found'; };

export type UniqueEmailResult = { status: 'unique' } | { status: 'not_unique' };

export type RegisterResult = 
  | { status: 'registered' }
  | { status: 'error' };

export class ServiceUnavailableError extends Error { }

export interface AccountClient {
  verifyCredentials(email: string, password: string): Promise<VerifyResult>;
  uniqueEmail(email: string): Promise<UniqueEmailResult>;
  register(email: string, password: string): Promise<RegisterResult>;
}

export function createAccountClient(baseUrl: string): AccountClient {
  return {
    async verifyCredentials(email, password) {
      const response = await fetch(`${baseUrl}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401) return { status: 'invalid' };
      if (response.status === 404) return { status: 'not_found' };
      if (!response.ok) {
        throw new Error(`Account service responded ${response.status}`);
      }

      const body = verifyResponseSchema.parse(await response.json());
      return {
        status: 'valid',
        customerId: body.customerId,
        accessToken: body.accessToken,
      };
    },
    async uniqueEmail(email) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/auth/unique-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        throw new ServiceUnavailableError((error as Error).message);
      }

      if (response.status >= 500) {
        throw new ServiceUnavailableError(
          `Account service responded ${response.status}`,
        );
      }
      if (!response.ok) {
        throw new Error(`Account service responded ${response.status}`);
      }
      const body = uniqueEmailResponseSchema.parse(await response.json());
      return { status: body.unique ? 'unique' : 'not_unique' };
    },
    async register(email, password) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        throw new ServiceUnavailableError((error as Error).message);
      }
      if (response.status === 409) return { status: 'error' };
      if (response.status >= 500) {
        throw new ServiceUnavailableError(
          `Account service responded ${response.status}`,
        );
      }
      if (!response.ok) {
        throw new Error(`Account service responded ${response.status}`);
      }
      return { status: 'registered' };
    }
  };
}
