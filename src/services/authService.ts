import type { AccountClient } from '../clients/accountClient';
import type { LoginThrottle } from '../middleware/loginThrottle';

export type LoginResult =
  | { status: 'success'; customerId: string; accessToken: string; }
  | { status: 'not_found'; }
  | { status: 'invalid'; }
  | { status: 'locked'; }
  | { status: 'error'; };

export type UniqueEmailResult =
  | { status: 'success' }
  | { status: 'not_unique' }
  | { status: 'error' };

export interface AuthService {
  login(email: string, password: string, ipAddress: string): Promise<LoginResult>;
  uniqueEmail(email: string): Promise<UniqueEmailResult>;
}

export function createAuthService(
  accountClient: AccountClient,
  throttle: LoginThrottle,
): AuthService {
  return {
    async login(email, password, ipAddress) {
      const keys = [`email:${email.toLowerCase()}`, `ip:${ipAddress}`];

      if (throttle.isLocked(keys)) return { status: 'locked' };

      try {
        const result = await accountClient.verifyCredentials(email, password);
        if (result.status === 'valid') {
          throttle.reset(keys);
          return {
            status: 'success',
            customerId: result.customerId,
            accessToken: result.accessToken,
          };
        }
        throttle.recordFailure(keys);
        return { status: result.status };
      } catch (error) {
        console.error('Account service call failed', (error as Error).message);
        return { status: 'error' };
      }
    },

    async uniqueEmail(email) {
      try {
        const result = await accountClient.uniqueEmail(email);
        if (result.status === 'unique') {
          return { status: 'success' };
        } else {
          return { status: 'not_unique' };
        }
      } catch (error) {
        console.error('Account service call failed', (error as Error).message);
        return { status: 'error' };
      }
    } 
  };
}
