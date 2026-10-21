import { resolve } from 'node:path'
import express, { type Express, type Request, type Response } from 'express'
import nunjucks from 'nunjucks'
import { createImagesRouter } from './controllers/images'
import { createProductsRouter } from './controllers/products'
import { registerRouter } from './controllers/register'
import { verifyEmailRouter } from './controllers/verifyEmail'
import type { ProductWithPrice } from './models/product'
import { fetchImage, type ProxiedImage } from './services/images'
import {
  getApiBaseUrl,
  getProductsWithPrices,
  getProductWithPrice,
} from './services/products'

export function createApp(
  fetchProducts: () => Promise<ProductWithPrice[]> = getProductsWithPrices,
  fetchProxiedImage: (fileName: string) => Promise<ProxiedImage | null> = (
    fileName,
  ) => fetchImage(fileName, getApiBaseUrl()),
  fetchProduct: (
    productID: string,
  ) => Promise<ProductWithPrice | null> = getProductWithPrice,
): Express {
  const app = express()

  nunjucks.configure(resolve('views'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production',
  })

  app.set('view engine', 'njk')
  app.use(express.static('public'))

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  app.use('/register', registerRouter)
  app.use('/verify-email', verifyEmailRouter)

  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/products')
  })

  app.use('/products', createProductsRouter(fetchProducts, fetchProduct))
  app.use('/images', createImagesRouter(fetchProxiedImage))

  return app
}
