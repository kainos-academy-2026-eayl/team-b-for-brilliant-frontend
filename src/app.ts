import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { adminLoginRouter } from './controllers/adminLogin';
import { adminAccountRouter } from './controllers/adminAccount';
import { registerRouter } from './controllers/register';
import { verifyEmailRouter } from './controllers/verifyEmail';


export function createApp(): Express {
  const app = express();
  app.locals.apiBaseUrl = process.env.API_BASE_URL ?? '';

  nunjucks.configure('views', { autoescape: true, express: app });
  app.set('view engine', 'njk');
  app.use(express.static('public'));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/register', registerRouter);
  app.use('/verify-email', verifyEmailRouter);
  app.use('/admin/login', adminLoginRouter);
  app.use('/admin/account', adminAccountRouter);

  return app;
}
