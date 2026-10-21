import type { AccountClient } from '../clients/accountClient'
import type { LoginThrottle } from '../middleware/loginThrottle'

export type LoginResult =
  | { status: 'success'; customerId: string }
  | { status: 'invalid' }
  | { status: 'locked' }
  | { status: 'error' }

export interface AuthService {
  login(email: string, password: string, ip: string): Promise<LoginResult>
}

export function createAuthService(
  accountClient: AccountClient,
  throttle: LoginThrottle,
): AuthService {
  return {
    async login(email, password, ip) {
      const keys = [`email:${email.toLowerCase()}`, `ip:${ip}`]

      if (throttle.isLocked(keys)) return { status: 'locked' }

      try {
        const result = await accountClient.verifyCredentials(email, password)
        if (result.status === 'valid') {
          throttle.reset(keys)
          return { status: 'success', customerId: result.customerId }
        }
        throttle.recordFailure(keys)
        return { status: 'invalid' }
      } catch (error) {
        console.error('Account service call failed', (error as Error).message)
        return { status: 'error' }
      }
    },
  }
}
