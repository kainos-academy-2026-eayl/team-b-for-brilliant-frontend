import { type Request, type Response, Router } from 'express'
import type { ProductWithPrice } from '../models/product'

export function createProductsRouter(
  fetchProducts: () => Promise<ProductWithPrice[]>,
): Router {
  const router = Router()

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const products = await fetchProducts()
      res.render('products/index.njk', { products })
    } catch (error) {
      console.error(error)
      res.status(502).render('error.njk', {
        message:
          'We could not load products right now. Please try again later.',
      })
    }
  })

  return router
}
