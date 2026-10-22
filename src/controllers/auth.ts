import { type NextFunction, type Request, type Response, Router } from 'express'
import type { AuthService } from '../services/authService'
import { safeRedirect } from '../utils/safeRedirect'

const GENERIC_ERROR = 'Email or password is incorrect. Please try again.'
const LOCKED_ERROR = 'Too many failed attempts. Please try again later.'
const UNAVAILABLE_ERROR =
  'We could not sign you in right now. Please try again later.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function createAuthRouter(authService: AuthService): Router {
  const router = Router()

  router.get('/login', (req: Request, res: Response) => {
    if (req.session.customerId) {
      res.redirect('/home')
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

      const renderError = (status: number, error: string) =>
        res.status(status).render('login', { error, email, returnTo })

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
      if (result.status === 'invalid') return renderError(401, GENERIC_ERROR)

      const { customerId } = result
      req.session.regenerate((error) => {
        if (error) return next(error)
        req.session.customerId = customerId
        req.session.save((saveError) => {
          if (saveError) return next(saveError)
          res.redirect(returnTo)
        })
      })
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
