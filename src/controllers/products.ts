import { type Request, type Response, Router } from 'express';
import type { ProductWithPrice } from '../models/product';
import { getProductWithPrice } from '../services/products';

export function createProductsRouter(
  fetchProducts: () => Promise<ProductWithPrice[]>,
  fetchProduct: (
    productID: string,
  ) => Promise<ProductWithPrice | null> = getProductWithPrice,
): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const products = await fetchProducts();
      res.render('products/index.njk', { products });
    } catch (error) {
      console.error(error);
      res.status(502).render('error.njk', {
        message:
          'We could not load products right now. Please try again later.',
      });
    }
  });

  router.get('/:productID', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const product = await fetchProduct(req.params.productID);
      if (product === null) {
        res.status(404).render('products/not-found.njk');
        return;
      }
      res.render('products/show.njk', { product });
    } catch (error) {
      console.error(error);
      res.status(502).render('error.njk', {
        message:
          'We could not load this product right now. Please try again later.',
      });
    }
  });

  return router;
}
