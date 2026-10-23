export type VerifyResult =
  | { status: 'valid'; customerId: string; mfaEnabled: boolean }
  | { status: 'invalid' }
  | { status: 'not_found' }

export type MfaVerifyResult = { status: 'valid' } | { status: 'invalid' }

// Network error, timeout or 5xx: the only failures that are retried
export class ServiceUnavailableError extends Error {}

export interface AccountClient {
  verifyCredentials(email: string, password: string): Promise<VerifyResult>
  verifyMfa(customerId: string, code: string): Promise<MfaVerifyResult>
}

export function createAccountClient(baseUrl: string): AccountClient {
  return {
    async verifyCredentials(email, password) {
      const response = await fetch(`${baseUrl}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(5000),
      })

      if (response.status === 401) return { status: 'invalid' }
      if (response.status === 404) return { status: 'not_found' }
      if (!response.ok) {
        throw new Error(`Account service responded ${response.status}`)
      }

      const body = (await response.json()) as {
        customerId: string
        mfaEnabled?: boolean
      }
      return {
        status: 'valid',
        customerId: body.customerId,
        mfaEnabled: body.mfaEnabled === true,
      }
    },

    async verifyMfa(customerId, code) {
      let response: Response
      try {
        response = await fetch(`${baseUrl}/auth/mfa/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId, code }),
          signal: AbortSignal.timeout(5000),
        })
      } catch (error) {
        throw new ServiceUnavailableError((error as Error).message)
      }

      if (response.status === 401) return { status: 'invalid' }
      if (response.status >= 500) {
        throw new ServiceUnavailableError(
          `MFA service responded ${response.status}`,
        )
      }
      if (!response.ok) {
        throw new Error(`MFA service responded ${response.status}`)
      }
      return { status: 'valid' }
    },
  }
}
