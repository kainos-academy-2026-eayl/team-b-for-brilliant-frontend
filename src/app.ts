import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import session from 'express-session';
import nunjucks from 'nunjucks';
import {
  type AccountClient,
  createAccountClient,
} from './clients/accountClient';
import { createAdminClient } from './clients/adminClient';
import { createAdminLoginRouter } from './controllers/adminLogin';
import {
  type AdminAuthService,
  createAdminAuthService,
} from './services/adminAuthService';
import { createAuthRouter } from './controllers/auth-controllers';
import { adminAccountRouter } from './controllers/adminAccount';
import { createBasketRouter } from './controllers/basket';
import { createImagesRouter } from './controllers/images';
import { createProductsRouter } from './controllers/products';
import { createProfileRouter } from './controllers/profile';
import { createAccountRouter } from './controllers/register';
import { createRegistrationDetailsRouter } from './controllers/registrationDetails';
import { verifyEmailRouter } from './controllers/verifyEmail';
import { csrfProtection } from './middleware/csrf';
import {
  createLoginThrottle,
  type LoginThrottle,
} from './middleware/loginThrottle';
import { requireAdmin } from './middleware/requireAdmin';
import { requireAuth } from './middleware/requireAuth';
import type { ProductWithPrice } from './models/product';
import { createHomeRouter } from './routes/home';
import { createAuthService } from './services/authService';
import { type BasketService, createMockBasketService } from './services/basket';
import { fetchImage, type ProxiedImage } from './services/images';
import {
  getApiBaseUrl,
  getProducts,
  getProductsWithPrices,
  getProductWithPrice,
  type ProductFilters,
} from './services/products';
import {
  createProfileService,
  type ProfileService,
} from './services/profileService';
import { createRegisterService } from './services/registerService';
import type { getSecurityQuestions, saveRegistrationDetails } from './services/registrationDetails';

interface AppOptions {
  saveRegistrationDetails?: typeof saveRegistrationDetails;
  getSecurityQuestions?: typeof getSecurityQuestions;
  accountClient?: AccountClient;
  profileService?: ProfileService;
  basketService?: BasketService;
  throttle?: LoginThrottle;
  adminAuthService?: AdminAuthService;
  fetchProducts?: (filters?: ProductFilters) => Promise<ProductWithPrice[]>;
  fetchProduct?: (productID: string) => Promise<ProductWithPrice | null>;
  fetchProxiedImage?: (fileName: string) => Promise<ProxiedImage | null>;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }

  if (isProd) app.set('trust proxy', 1);

  nunjucks.configure(path.resolve('views'), {
    autoescape: true,
    express: app,
    noCache: !isProd,
  });
  app.set('view engine', 'njk');
  app.use('/static', express.static(path.resolve('public')));
  app.use(
    '/images',
    express.static(path.resolve('public/images'), { index: false, redirect: false }),
  );
  app.use('/assets', express.static(path.resolve('src/public')));

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'dev-only-secret',
      resave: false,
      saveUninitialized: true,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 2,
      },
    }),
  );
  app.use(csrfProtection);
  app.use((req, res, next) => {
    res.locals.isSignedIn = Boolean(req.session.customerId);
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.currentPath = req.path;
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(
    '/home',
    requireAuth,
    createHomeRouter(options.fetchProducts ?? getProductsWithPrices),
  );

  app.use('/verify-email', verifyEmailRouter);

  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/login');
  });

  app.use(
    '/products',
    createProductsRouter(
      options.fetchProducts ?? ((filters) =>
        getProductsWithPrices(undefined, undefined, undefined, filters)),
      options.fetchProduct ?? getProductWithPrice,
      options.fetchProducts ?? getProducts,
    ),
  );
  app.use(
    '/images',
    createImagesRouter(
      options.fetchProxiedImage ??
      ((fileName) => fetchImage(fileName, getApiBaseUrl())),
    ),
  );

  const accountClient =
    options.accountClient ??
    createAccountClient(process.env.CUSTOMER_ACCOUNT_SERVICE_URL ?? '');
  const authService = createAuthService(
    accountClient,
    options.throttle ?? createLoginThrottle(),
  );

  app.use(createAuthRouter(authService));
  //app.use(createAccountRouter(accountClient));

  app.get('/forgot-password', (_req, res) => res.render('forgot-password'));
  app.use(
    '/account',
    requireAuth,
    createProfileRouter(options.profileService ?? createProfileService()),
  );
  app.use(
    '/basket',
    requireAuth,
    createBasketRouter(options.basketService ?? createMockBasketService()),
  );
  app.use(
    '/admin/login',
    createAdminLoginRouter(
      options.adminAuthService ??
      createAdminAuthService(
        createAdminClient(process.env.API_BASE_URL ?? ''),
      ),
    ),
  );
  app.use('/admin/account', requireAdmin, adminAccountRouter);
  const registerService = createRegisterService(accountClient);
  app.use(createAccountRouter(authService, registerService));
  app.use('/register/details', createRegistrationDetailsRouter(
    options.saveRegistrationDetails, options.getSecurityQuestions,
  ));

  return app;
}
