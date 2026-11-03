import { type Request, type Response, Router } from 'express'
import type { AuthService } from '../services/authService'
import { safeRedirect } from '../utils/safeRedirect'
import { signIn, signOut } from '../middleware/authentication'
import { saveBrowserState, tokenHash } from '../middleware/browserState'

const GENERIC_ERROR = 'Email or password is incorrect. Please try again.'
const NOT_FOUND_ERROR =
  'We could not find an account with that email address. Please register to create one.'
const LOCKED_ERROR = 'Too many failed attempts. Please try again later.'
const UNAVAILABLE_ERROR =
  'We could not sign you in right now. Please try again later.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function createAuthRouter(authService: AuthService): Router {
  const router = Router()

  router.get('/login', (req: Request, res: Response) => {
    if (req.auth) {
      res.redirect('/account')
      return
    }
    res.render('login', { returnTo: safeRedirect(req.query.returnTo) })
  })

  router.post(
    '/login',
    async (req: Request, res: Response) => {
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

      const resumeRegistration =
        req.browserState.pendingRegistrationEmail === email.toLowerCase()
      try {
        await signIn(req, res, result.accessToken, result.customerId)
        if (resumeRegistration) {
          req.browserState.registrationTokenHash = tokenHash(result.accessToken)
          saveBrowserState(req, res)
        }
        res.redirect(resumeRegistration ? '/register/details' : returnTo)
      } catch (error) {
        console.error('JWT sign-in failed', error)
        return renderError(503, UNAVAILABLE_ERROR)
      }
    },
  )

  router.post('/logout', async (req: Request, res: Response) => {
    try {
      await signOut(req, res)
      res.redirect('/login')
    } catch (error) {
      console.error('JWT sign-out failed', error)
      res.status(503).render('error', {
        message: 'You have been signed out in this browser, but we could not revoke your token. Please try again later.',
      })
    }
  })

  return router
}
