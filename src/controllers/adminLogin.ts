import { Router, type Request, type Response } from 'express';

export const adminLoginRouter = Router();

adminLoginRouter.get('/', (_req: Request, res: Response) => {
    res.render('admin-login', { apiBaseUrl: process.env.API_BASE_URL ?? '' });
});
