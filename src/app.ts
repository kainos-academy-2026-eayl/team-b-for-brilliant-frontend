import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
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
import { createCheckoutRouter } from './controllers/checkout';
import { createDiscountsRouter } from './controllers/discounts';
import { createImagesRouter } from './controllers/images';
import { createProductsRouter } from './controllers/products';
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
import { requireAdmin, requireAdminRole } from './middleware/requireAdmin';
import { requireAuth } from './middleware/requireAuth';
import type { Discount } from './models/discount';
import type { ProductWithPrice } from './models/product';
import { createHomeRouter } from './routes/home';
import { createAuthService } from './services/authService';
import { type BasketService, createBasketService } from './services/basket';
import { type CheckoutService, createCheckoutService } from './services/checkout';
import {
  activateDiscount,
  createDiscount,
  deactivateDiscount,
  getDiscounts,
} from './services/discounts';
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
import { createProductEditorRouter } from './controllers/productEditor';
import { createProductEditorService, type ProductEditorService } from './services/productEditor';

interface AppOptions {
  tokenClient?: TokenClient;
  saveRegistrationDetails?: typeof saveRegistrationDetails;
  getSecurityQuestions?: typeof getSecurityQuestions;
  accountClient?: AccountClient;
  profileService?: ProfileService;
  basketService?: BasketService;
  checkoutService?: CheckoutService;
  throttle?: LoginThrottle;
  adminAuthService?: AdminAuthService;
  fetchProducts?: (filters?: ProductFilters, adminToken?: string) => Promise<ProductWithPrice[]>;
  fetchProduct?: (productID: string, adminToken?: string) => Promise<ProductWithPrice | null>;
  fetchProxiedImage?: (fileName: string) => Promise<ProxiedImage | null>;
  fetchDiscounts?: (token?: string) => Promise<Discount[]>;
  productEditorService?: ProductEditorService;
  saveDiscount?: typeof createDiscount;
  activateDiscount?: typeof activateDiscount;
  deactivateDiscount?: typeof deactivateDiscount;
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

  app.use(
    '/products/:productID/edit',
    express.urlencoded({ extended: false, limit: '128kb' }),
    express.json({ limit: '8mb' }),
  );
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(createBrowserState());
  app.use(csrfProtection);
  app.use(createAuthentication(options.tokenClient ?? createTokenClient(getApiBaseUrl())));
  app.use((req, res, next) => {
    res.locals.isSignedIn = Boolean(req.auth);
    res.locals.isAdmin = req.auth?.accessLevel === 1;
    res.locals.csrfToken = req.browserState.csrfToken;
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

  const productEditorService = options.productEditorService ?? createProductEditorService();
  const fetchProducts = options.fetchProducts;
  app.use('/products', createProductEditorRouter(productEditorService));
  app.use(
    '/products',
    createProductsRouter(
      fetchProducts ?? ((filters, adminToken) =>
        getProductsWithPrices(undefined, undefined, undefined, filters, adminToken)),
      options.fetchProduct ?? ((productID, adminToken) =>
        getProductWithPrice(productID, undefined, undefined, adminToken)),
      fetchProducts
        ? (adminToken) => adminToken
          ? fetchProducts(undefined, adminToken)
          : fetchProducts()
        : (adminToken) => getProducts(undefined, undefined, undefined, adminToken),
    ),
  );
  app.use(
    '/discounts',
    requireAdminRole,
    createDiscountsRouter(
      options.fetchDiscounts ?? getDiscounts,
      options.saveDiscount ?? createDiscount,
      options.activateDiscount ?? activateDiscount,
      options.deactivateDiscount ?? deactivateDiscount,
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
    createProfileRouter(
      options.profileService ?? createProfileService(),
      authService,
    ),
  );
  app.use(
    '/basket',
    requireAuth,
    createBasketRouter(options.basketService ?? createBasketService()),
  );
  app.use(
    '/checkout',
    requireAuth,
    createCheckoutRouter(
      options.basketService ?? createBasketService(),
      options.profileService ?? createProfileService(),
      options.checkoutService ?? createCheckoutService(),
    ),
  );
  app.use(
    '/admin/login',
    createAdminLoginRouter(
      options.adminAuthService ??
      createAdminAuthService(
        createAdminClient(getApiBaseUrl()),
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
