import 'express-session'

declare module 'express-session' {
  interface SessionData {
    customerId?: string
    csrfToken?: string
  }
}
