import 'express-session'

declare module 'express-session' {
  interface SessionData {
    customerId?: string
    // TEMPORARY (KAN-98): backend API token, replace when login is reworked
    apiToken?: string | undefined
    accountToken?: string
    registrationDetailsPending?: boolean
    pendingRegistrationEmail?: string
    csrfToken?: string
    isAdmin?: boolean
    pendingMfa?: { customerId: string; returnTo: string; expiresAt: number }
  }
}
