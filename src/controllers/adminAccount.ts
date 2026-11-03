import { type Request, type Response, Router } from 'express';
import { signOut } from '../middleware/authentication';

export const adminAccountRouter = Router();

adminAccountRouter.get('/', (_req: Request, res: Response) => {
    res.render('admin-account');
});

adminAccountRouter.post('/logout', async (req: Request, res: Response) => {
    try {
        await signOut(req, res);
        res.redirect('/admin/login');
    } catch (error) {
        console.error('Admin JWT sign-out failed', error);
        res.status(503).render('error', {
            message: 'You have been signed out in this browser, but we could not revoke your token. Please try again later.',
        });
    }
});
