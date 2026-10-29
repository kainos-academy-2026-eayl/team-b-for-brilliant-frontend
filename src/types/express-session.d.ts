import 'express-session'

declare module 'express-session' {
  interface SessionData {
    customerId?: string
    accountToken?: string
    csrfToken?: string
    pendingMfa?: { customerId: string; returnTo: string; expiresAt: number }
  }
}
