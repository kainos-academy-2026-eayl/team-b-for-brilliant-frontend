export type VerifyResult =
  | { status: 'valid'; customerId: string }
  | { status: 'invalid' }

export interface AccountClient {
  verifyCredentials(email: string, password: string): Promise<VerifyResult>
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
      if (!response.ok) {
        throw new Error(`Account service responded ${response.status}`)
      }

      const body = (await response.json()) as { customerId: string }
      return { status: 'valid', customerId: body.customerId }
    },
  }
}
