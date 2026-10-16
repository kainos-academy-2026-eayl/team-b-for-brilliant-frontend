import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import nunjucks from 'nunjucks';
import { sessionMiddleware } from './middleware/session';
import { authRouter } from './routes/auth.routes';

export function createApp(): Express {
  const app = express();

  nunjucks.configure('src/views', { autoescape: true, express: app });
  app.set('view engine', 'njk');

  // Registered before the session so health checks don't touch the session store.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(helmet());
  app.use(express.static('public'));
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware);
  app.use((req, res, next) => {
    res.locals['customerName'] = req.session.name;
    next();
  });

  app.use(authRouter);

  return app;
}
