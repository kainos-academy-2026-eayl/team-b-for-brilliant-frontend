import { Router, type Request, type Response } from 'express';

export const adminAccountRouter = Router();

adminAccountRouter.get('/', (_req: Request, res: Response) => {
    res.render('admin-account');
});
