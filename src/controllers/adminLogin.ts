import { type NextFunction, type Request, type Response, Router } from 'express';
import {
    type AdminAuthService,
    COMPANY_DOMAIN,
} from '../services/adminAuthService';
import { safeRedirect } from '../utils/safeRedirect';

const DEFAULT_DESTINATION = '/admin/account';
const INVALID_ERROR = 'Invalid email or password.';
const LOCKED_ERROR = 'Too many attempts. Please try again later.';
const UNAVAILABLE_ERROR = 'Something went wrong. Please try again.';

export function createAdminLoginRouter(
    adminAuthService: AdminAuthService,
): Router {
    const router = Router();

    router.get('/', (req: Request, res: Response) => {
        const next = safeRedirect(req.query.next, DEFAULT_DESTINATION);
        if (req.session.isAdmin) {
            res.redirect(next);
            return;
        }
        res.render('admin-login', { next });
    });

    router.post('/', async (req: Request, res: Response, nextFn: NextFunction) => {
        const body = req.body ?? {};
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const next = safeRedirect(body.next, DEFAULT_DESTINATION);

        const emailError = !email
            ? 'Enter your email.'
            : !email.endsWith(COMPANY_DOMAIN)
                ? 'Use your company email address.'
                : '';
        const passwordError = password ? '' : 'Enter your password.';

        const renderError = (
            status: number,
            errors: { email?: string; password?: string; form?: string; },
        ) => res.status(status).render('admin-login', { email, next, errors });

        if (emailError || passwordError) {
            renderError(400, { email: emailError, password: passwordError });
            return;
        }

        const result = await adminAuthService.login(email, password);

        if (result.status === 'invalid') return renderError(401, { form: INVALID_ERROR });
        if (result.status === 'locked') return renderError(429, { form: LOCKED_ERROR });
        if (result.status === 'error') return renderError(503, { form: UNAVAILABLE_ERROR });

        req.session.regenerate((error) => {
            if (error) return nextFn(error);
            req.session.isAdmin = true;
            req.session.save((saveError) => {
                if (saveError) return nextFn(saveError);
                res.redirect(next);
            });
        });
    });

    return router;
}
