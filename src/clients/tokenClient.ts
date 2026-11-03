import { z } from 'zod';

const identitySchema = z.object({
  customerId: z.string().trim().min(1),
  accessLevel: z.union([z.literal(0), z.literal(1)]),
});

export type Identity = z.infer<typeof identitySchema>;

export interface TokenClient {
  getIdentity(token: string): Promise<Identity | null>;
  logout(token: string): Promise<void>;
}

export function createTokenClient(baseUrl: string): TokenClient {
  return {
    async getIdentity(token) {
      const response = await fetch(`${baseUrl}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(`Token validation responded ${response.status}`);
      return identitySchema.parse(await response.json());
    },
    async logout(token) {
      const response = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Token revocation responded ${response.status}`);
    },
  };
}
