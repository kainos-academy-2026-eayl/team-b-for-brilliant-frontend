import {
  type AccountClient,
  ServiceUnavailableError,
} from '../clients/accountClient';
import type { LoginThrottle } from '../middleware/loginThrottle';

const MFA_MAX_RETRIES = 4; // 1 attempt + 4 retries = 5 calls

export type LoginResult =
  | { status: 'success'; customerId: string; token?: string | undefined }
  | { status: 'mfa_required'; customerId: string }
  | { status: 'not_found' }
  | { status: 'invalid' }
  | { status: 'locked' }
  | { status: 'error' }

export type UniqueEmailResult =
  | { status: 'success' }
  | { status: 'not_unique' }
  | { status: 'error' };

export type MfaResult =
  | { status: 'success'; }
  | { status: 'invalid'; }
  | { status: 'locked'; }
  | { status: 'error'; };

export interface AuthService {
  login(email: string, password: string, ipAddress: string): Promise<LoginResult>;
  completeMfa(customerId: string, code: string, ipAddress: string): Promise<MfaResult>;
  uniqueEmail(email: string): Promise<UniqueEmailResult>;
}

interface AuthServiceOptions {
  mfaRetryDelayMs?: number;
}

const sleep = (sleepTimeMilliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, sleepTimeMilliseconds));

export function createAuthService(
  accountClient: AccountClient,
  throttle: LoginThrottle,
  { mfaRetryDelayMs = 500 }: AuthServiceOptions = {},
): AuthService {
  async function verifyMfaWithRetry(customerId: string, code: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await accountClient.verifyMfa(customerId, code);
      } catch (error) {
        const retryable = error instanceof ServiceUnavailableError;
        if (!retryable || attempt >= MFA_MAX_RETRIES) throw error;
        await sleep(mfaRetryDelayMs);
      }
    }
  }

  return {
    async login(email, password, ipAddress) {
      const keys = [`email:${email.toLowerCase()}`, `ip:${ipAddress}`];

      if (throttle.isLocked(keys)) return { status: 'locked' };

      try {
        const result = await accountClient.verifyCredentials(email, password);
        if (result.status === 'valid') {
          throttle.reset(keys);
          return result.mfaEnabled
            ? { status: 'mfa_required', customerId: result.customerId }
            : {
                status: 'success',
                customerId: result.customerId,
                token: result.token,
              }
        }
        throttle.recordFailure(keys);
        return { status: result.status };
      } catch (error) {
        console.error('Account service call failed', (error as Error).message);
        return { status: 'error' };
      }
    },

    async completeMfa(customerId, code, ipAddress) {
      const keys = [`mfa:${customerId}`, `mfa-ip:${ipAddress}`];

      if (throttle.isLocked(keys)) return { status: 'locked' };

      try {
        const result = await verifyMfaWithRetry(customerId, code);
        if (result.status === 'valid') {
          throttle.reset(keys);
          return { status: 'success' };
        }
        throttle.recordFailure(keys);
        return { status: 'invalid' };
      } catch (error) {
        console.error('MFA service call failed', (error as Error).message);
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
