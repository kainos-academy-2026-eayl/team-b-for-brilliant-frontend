import { createApp } from '../../app';
import type { Identity, TokenClient } from '../../clients/tokenClient';

export function createTestApp(
  options: Parameters<typeof createApp>[0] = {},
  accessLevel: Identity['accessLevel'] = 0,
) {
  const identities = new Map<string, Identity>();
  const accountClient = options.accountClient;
  const tokenClient: TokenClient = {
    async getIdentity(token) {
      return identities.get(token) ?? null;
    },
    async logout(token) {
      identities.delete(token);
    },
  };
  return createApp({
    ...options,
    tokenClient: options.tokenClient ?? tokenClient,
    ...(accountClient ? {
      accountClient: {
        ...accountClient,
        async verifyCredentials(email: string, password: string) {
          const result = await accountClient.verifyCredentials(email, password);
          if (result.status === 'valid') {
            identities.set(result.accessToken, {
              customerId: result.customerId,
              accessLevel,
            });
          }
          return result;
        },
      },
    } : {}),
  });
}
