import path from 'node:path'
import express, { type Express, type Request, type Response } from 'express'
import session from 'express-session'
import nunjucks from 'nunjucks'
import {
  type AccountClient,
  createAccountClient,
} from './clients/accountClient'
import { createAuthRouter } from './controllers/auth'
import { csrfProtection } from './middleware/csrf'
import {
  createLoginThrottle,
  type LoginThrottle,
} from './middleware/loginThrottle'
import { requireAuth } from './middleware/requireAuth'
import { createAuthService } from './services/authService'

interface AppOptions {
  accountClient?: AccountClient
  throttle?: LoginThrottle
}

export function createApp(options: AppOptions = {}): Express {
  const app = express()
  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) app.set('trust proxy', 1)

  nunjucks.configure(path.resolve('views'), { autoescape: true, express: app })
  app.set('view engine', 'njk')
  app.use('/static', express.static(path.resolve('public')))

  app.use(express.urlencoded({ extended: false, limit: '10kb' }))
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'dev-only-secret',
      resave: false,
      saveUninitialized: true,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 2,
      },
    }),
  )
  app.use(csrfProtection)
  app.use((req, res, next) => {
    res.locals.isSignedIn = Boolean(req.session.customerId)
    res.locals.csrfToken = req.session.csrfToken
    next()
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/register', registerRouter);
  app.use('/verify-email', verifyEmailRouter);

  const accountClient =
    options.accountClient ??
    createAccountClient(process.env.CUSTOMER_ACCOUNT_SERVICE_URL ?? '')
  const authService = createAuthService(
    accountClient,
    options.throttle ?? createLoginThrottle(),
  )

  app.use(createAuthRouter(authService))

  app.get('/forgot-password', (_req, res) => res.render('forgot-password'))
  app.get('/account', requireAuth, (_req, res) => res.render('account'))

  return app
}
