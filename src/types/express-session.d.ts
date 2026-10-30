import 'express-session'

declare module 'express-session' {
  interface SessionData {
    customerId?: string
    apiToken?: string | undefined
    csrfToken?: string
    pendingMfa?: { customerId: string; apiToken?: string | undefined; returnTo: string; expiresAt: number }
  }
}
