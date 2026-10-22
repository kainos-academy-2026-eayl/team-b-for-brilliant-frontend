import { Router } from 'express'
import { createShowHome } from '../controllers/home'
import type { ProductWithPrice } from '../models/product'

export function createHomeRouter(
  fetchProducts: () => Promise<ProductWithPrice[]>,
) {
  const router = Router()

  router.get('/', createShowHome(fetchProducts))
  return router
}
