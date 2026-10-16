import { Router, type Request, type Response } from 'express';

export const registerRouter = Router();

registerRouter.get('/', (_req: Request, res: Response) => {
    res.render('register', { apiBaseUrl: process.env.API_BASE_URL ?? '' });
});