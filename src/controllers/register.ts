import { type Request, type Response, Router } from 'express';
import { safeRedirect } from '../utils/safeRedirect';
import type { AuthService } from '../services/authService';
import type { RegisterService } from '../services/registerService';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_ERROR = 'Email or password is incorrect. Please try again.';
const EXISTING_ACCOUNT_ERROR = 'An account with this email address already exists. Please sign in.';
const UNAVAILABLE_ERROR =
    'We could not register your account right now. Please try again later.'

export function createAccountRouter(authService: AuthService, registerService: RegisterService): Router {
    const router = Router();

    router.get('/register', (req: Request, res: Response) => {
        if (req.session.customerId) {
            res.redirect('/account');
            return;
        }
        res.render('register', {
            returnTo: safeRedirect(req.query.returnTo),
            registered: req.query.registered === '1',
        });
    });

    router.post(
        '/register',
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
              .render('register', { error, email, returnTo, showRegisterLink })
    
          if (!EMAIL_PATTERN.test(email) || password.length === 0) {
            renderError(401, GENERIC_ERROR)
            return
          }
    
          const result = await authService.uniqueEmail(
            email
          )
    
          if (result.status === 'not_unique') return renderError(409, EXISTING_ACCOUNT_ERROR)
          if (result.status === 'error') return renderError(503, UNAVAILABLE_ERROR)
    
          const registerResult = await registerService.register(email, password)

          if (registerResult.status === 'error') return renderError(503, UNAVAILABLE_ERROR)

          res.redirect(303, '/register?registered=1')
        },
      )

    return router;
}
