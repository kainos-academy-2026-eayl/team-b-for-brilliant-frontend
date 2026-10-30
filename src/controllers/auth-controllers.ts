import { type NextFunction, type Request, type Response, Router } from 'express'
import type { AuthService } from '../services/authService'
import { safeRedirect } from '../utils/safeRedirect'

const GENERIC_ERROR = 'Email or password is incorrect. Please try again.'
const NOT_FOUND_ERROR =
  'We could not find an account with that email address. Please register to create one.'
const LOCKED_ERROR = 'Too many failed attempts. Please try again later.'
const UNAVAILABLE_ERROR =
  'We could not sign you in right now. Please try again later.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function createAuthRouter(authService: AuthService): Router {
  const router = Router()

  const startSession = (
    req: Request,
    res: Response,
    next: NextFunction,
    customerId: string,
    returnTo: string,
    apiToken?: string | undefined,
    accountToken?: string,
    registrationDetailsPending = false,
  ) =>
    req.session.regenerate((error) => {
      if (error) return next(error)
      req.session.customerId = customerId
      req.session.apiToken = apiToken
      if (accountToken) req.session.accountToken = accountToken
      if (registrationDetailsPending) req.session.registrationDetailsPending = true
      req.session.save((saveError) => {
        if (saveError) return next(saveError)
        res.redirect(returnTo)
      })
    })

  router.get('/login', (req: Request, res: Response) => {
    if (req.session.customerId) {
      res.redirect('/account')
      return
    }
    res.render('login', { returnTo: safeRedirect(req.query.returnTo) })
  })

  router.post(
    '/login',
    async (req: Request, res: Response, next: NextFunction) => {
      const body = req.body ?? {}
      const email = String(body.email ?? '').trim()
      const password = String(body.password ?? '')
      const returnTo = safeRedirect(body.returnTo)

      const renderError = (
        status: number,
        error: string,
        showRegisterLink = false,
      ) =>
        res
          .status(status)
          .render('login', { error, email, returnTo, showRegisterLink })

      if (!EMAIL_PATTERN.test(email) || password.length === 0) {
        renderError(401, GENERIC_ERROR)
        return
      }

      const result = await authService.login(
        email,
        password,
        req.ip ?? 'unknown',
      )

      if (result.status === 'locked') return renderError(429, LOCKED_ERROR)
      if (result.status === 'error') return renderError(503, UNAVAILABLE_ERROR)
      if (result.status === 'not_found') {
        return renderError(404, NOT_FOUND_ERROR, true)
      }
      if (result.status === 'invalid') return renderError(401, GENERIC_ERROR)

      const { customerId, apiToken } = result

      if (result.status === 'mfa_required') {
        req.session.regenerate((error) => {
          if (error) return next(error)
          req.session.pendingMfa = {
            customerId,
            apiToken,
            returnTo,
            expiresAt: Date.now() + MFA_WINDOW_MS,
          }
          req.session.save((saveError) => {
            if (saveError) return next(saveError)
            res.redirect('/login/mfa')
          })
        })
        return
      }

      startSession(req, res, next, customerId, returnTo, apiToken)
    },
  )

  router.get('/login/mfa', (req: Request, res: Response) => {
    const pending = req.session.pendingMfa
    if (!pending || pending.expiresAt < Date.now()) {
      delete req.session.pendingMfa
      res.redirect('/login')
      return
    }
    res.render('login-mfa')
  })

  router.post(
    '/login/mfa',
    async (req: Request, res: Response, next: NextFunction) => {
      const pending = req.session.pendingMfa
      if (!pending || pending.expiresAt < Date.now()) {
        delete req.session.pendingMfa
        res.redirect('/login')
        return
      }

      const code = String(req.body?.code ?? '').trim()
      const renderError = (
        status: number,
        error: string,
        mfaUnavailable = false,
      ) => res.status(status).render('login-mfa', { error, mfaUnavailable })

      if (!MFA_CODE_PATTERN.test(code)) {
        renderError(401, MFA_FAILED_ERROR)
        return
      }

      const result = await authService.completeMfa(
        pending.customerId,
        code,
        req.ip ?? 'unknown',
      )

      if (result.status === 'locked') return renderError(429, LOCKED_ERROR)
      if (result.status === 'invalid') return renderError(401, MFA_FAILED_ERROR)
      if (result.status === 'error') {
        delete req.session.pendingMfa
        return renderError(503, MFA_UNAVAILABLE_ERROR, true)
      }

      startSession(
        req,
        res,
        next,
        pending.customerId,
        pending.returnTo,
        pending.apiToken,
      )
      const { customerId } = result
      const resumeRegistration = result.status === 'success'
        && req.session.pendingRegistrationEmail === email.toLowerCase()

      startSession(
        req, res, next, customerId, resumeRegistration ? '/register/details' : returnTo,
        result.status === 'success' ? result.accessToken : undefined,
        resumeRegistration,
      )
    },
  )

  router.post('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.redirect('/login')
    })
  })

  return router
}
