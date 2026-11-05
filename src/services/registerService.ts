import type { AccountClient } from '../clients/accountClient';

export type RegisterResult =
  | { status: 'success' }
  | { status: 'existing' }
  | { status: 'error' };

export interface RegisterService {
  register(email: string, password: string): Promise<RegisterResult>;
}

export function createRegisterService(
  accountClient: AccountClient,
): RegisterService {
  return {
    async register(email, password) {
      try {
        const result = await accountClient.register(email, password);
        if (result.status === 'registered') {
          return { status: 'success' };
        } else if (result.status === 'existing') {
          return { status: 'existing' };
        } else {
          return { status: 'error' };
        }
      } catch (error) {
        console.error('Account service call failed', (error as Error).message);
        return { status: 'error' };
      }
    } 
  };
}
