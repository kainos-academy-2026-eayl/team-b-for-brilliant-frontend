import type { Request, Response } from 'express';
import { loginSchema } from '../dtos/login.dto';
import { authenticate } from '../services/auth.service';
import { safeReturnTo } from '../utils/safe-return-to';

const GENERIC_ERROR = 'Incorrect email or password';
const LOCKED_ERROR = 'Too many attempts, please try again later';

export function showLogin(req: Request, res: Response): void {
    res.render('login', { returnTo: safeReturnTo(req.query['returnTo']) });
}

export async function postLogin(req: Request, res: Response): Promise<void> {
    const returnTo = safeReturnTo(req.body?.returnTo);
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(401).render('login', { error: GENERIC_ERROR, returnTo });
        return;
    }

    const { email, password } = parsed.data;
    const result = await authenticate(email, password);

    if (result.status !== 'ok') {
        console.warn('login_failed', { reason: result.status, ip: req.ip });
        const locked = result.status === 'locked';
        res
            .status(locked ? 429 : 401)
            .render('login', { error: locked ? LOCKED_ERROR : GENERIC_ERROR, email, returnTo });
        return;
    }

    await new Promise<void>((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.customerId = result.customer.id;
    req.session.name = result.customer.name;

    console.info('login_success', { customerId: result.customer.id });
    res.redirect(returnTo);
}

export function postLogout(req: Request, res: Response): void {
    req.session.destroy(() => {
        res.clearCookie('sid');
        res.redirect('/login');
    });
}
