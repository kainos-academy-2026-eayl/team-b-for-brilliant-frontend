import type { AdminClient } from '../clients/adminClient'

export const COMPANY_DOMAIN = '@b-brilliant.com'

export type AdminLoginResult =
  | { status: 'success' }
  | { status: 'invalid' }
  | { status: 'locked' }
  | { status: 'error' }

export interface AdminAuthService {
  login(email: string, password: string): Promise<AdminLoginResult>
}

export function createAdminAuthService(
  adminClient: AdminClient,
): AdminAuthService {
  return {
    async login(email, password) {
      try {
        const result = await adminClient.verifyCredentials(email, password)
        if (result.status === 'valid') return { status: 'success' }
        return { status: result.status }
      } catch (error) {
        console.error(error)
        return { status: 'error' }
      }
    },
  }
}
