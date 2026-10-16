import { Router, type Request, type Response } from 'express';

export const verifyEmailRouter = Router();

verifyEmailRouter.get('/', (_req: Request, res: Response) => {
    res.render('verify-email', { apiBaseUrl: process.env.API_BASE_URL ?? '' });
});