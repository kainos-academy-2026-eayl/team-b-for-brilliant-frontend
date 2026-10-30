import { type Request, type Response, Router } from 'express';

export const adminAccountRouter = Router();

adminAccountRouter.get('/', (_req: Request, res: Response) => {
    res.render('admin-account');
});

adminAccountRouter.post('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/admin/login');
    });
});
