import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import {
  type AccountClient,
  createAccountClient,
} from './clients/accountClient';
import { createAuthRouter } from './controllers/auth-controllers';
import { adminAccountRouter } from './controllers/adminAccount';
import { createBasketRouter } from './controllers/basket';
import { createDiscountsRouter } from './controllers/discounts';
import { createImagesRouter } from './controllers/images';
import { createProductsRouter } from './controllers/products';
import { createProductCreationRouter } from './controllers/createProduct';
import { createProfileRouter } from './controllers/profile';
import { createAccountRouter } from './controllers/register';
import { createRegistrationDetailsRouter } from './controllers/registrationDetails';
import { verifyEmailRouter } from './controllers/verifyEmail';
import { csrfProtection } from './middleware/csrf';
import { createBrowserState } from './middleware/browserState';
import { createAuthentication } from './middleware/authentication';
import { createTokenClient, type TokenClient } from './clients/tokenClient';
import {
  createLoginThrottle,
  type LoginThrottle,
} from './middleware/loginThrottle';
import { requireAdmin } from './middleware/requireAdmin';
import { parseProductUpload } from './middleware/productUpload';
import { requireAuth } from './middleware/requireAuth';
import type { Discount } from './models/discount';
import type { ProductWithPrice } from './models/product';
import { createHomeRouter } from './routes/home';
import { createAuthService } from './services/authService';
import { createDiscount, getDiscounts } from './services/discounts';
import { type BasketService, createBasketService } from './services/basket';
import { fetchImage, type ProxiedImage } from './services/images';
import {
  getApiBaseUrl,
  createProduct,
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
  tokenClient?: TokenClient;
  saveRegistrationDetails?: typeof saveRegistrationDetails;
  getSecurityQuestions?: typeof getSecurityQuestions;
  accountClient?: AccountClient;
  profileService?: ProfileService;
  basketService?: BasketService;
  throttle?: LoginThrottle;
  fetchProducts?: (filters?: ProductFilters) => Promise<ProductWithPrice[]>;
  fetchProduct?: (productID: string) => Promise<ProductWithPrice | null>;
  fetchProxiedImage?: (fileName: string) => Promise<ProxiedImage | null>;
  fetchDiscounts?: (token?: string) => Promise<Discount[]>;
  saveDiscount?: typeof createDiscount;
  saveProduct?: typeof createProduct;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

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
  app.use(createBrowserState());
  app.use(createAuthentication(options.tokenClient ?? createTokenClient(getApiBaseUrl())));
  app.use((req, res, next) => {
    res.locals.isSignedIn = Boolean(req.auth);
    res.locals.isAdmin = req.auth?.accessLevel === 1;
    res.locals.csrfToken = req.browserState.csrfToken;
    res.locals.currentPath = req.path;
    next();
  });
  app.post('/products/add', requireAdmin, parseProductUpload);
  app.use(csrfProtection);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(
    '/home',
    createHomeRouter(options.fetchProducts ?? getProductsWithPrices),
  );

  app.use('/verify-email', verifyEmailRouter);

  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/home');
  });

  app.use('/products/add', createProductCreationRouter(options.saveProduct ?? createProduct));
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
    '/discounts',
    createDiscountsRouter(
      options.fetchDiscounts ?? getDiscounts,
      options.saveDiscount ?? createDiscount,
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
    createAccountClient(getApiBaseUrl());
  const authService = createAuthService(
    accountClient,
    options.throttle ?? createLoginThrottle(),
  );

  app.use(createAuthRouter(authService));

  app.get('/forgot-password', (_req, res) => res.render('forgot-password'));
  app.use(
    '/account',
    requireAuth,
    createProfileRouter(options.profileService ?? createProfileService()),
  );
  app.use(
    '/basket',
    requireAuth,
    createBasketRouter(options.basketService ?? createBasketService()),
  );
  app.use('/admin/account', requireAdmin, adminAccountRouter);
  const registerService = createRegisterService(accountClient);
  app.use(createAccountRouter(authService, registerService));
  app.use('/register/details', createRegistrationDetailsRouter(
    options.saveRegistrationDetails, options.getSecurityQuestions,
  ));

  return app;
}
