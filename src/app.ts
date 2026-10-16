import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { registerRouter } from './controllers/register';
import { verifyEmailRouter } from './controllers/verifyEmail';


export function createApp(): Express {
  const app = express();

  nunjucks.configure('views', { autoescape: true, express: app });
  app.set('view engine', 'njk');
  app.use(express.static('public'));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/register', registerRouter);
  app.use('/verify-email', verifyEmailRouter);

  return app;
}