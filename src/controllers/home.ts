import type { Request, Response } from 'express';
import type { ProductWithPrice } from '../models/product';

export function createShowHome(
  fetchProducts: () => Promise<ProductWithPrice[]>,
) {
  return async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    try {
      const products = (await fetchProducts())
        .filter(
          (product) =>
            product.visible && !product.draft && product.deletedAt === null,
        )
        .sort(
          (product1, product2) =>
            product2.salesNo - product1.salesNo ||
            product2.productID.localeCompare(product1.productID, 'en', { numeric: true }),
        );
      res.render('home', { products: products.slice(0, 3) });
    } catch (error) {
      console.error(error);
      res.status(502).render('home', {
        products: [],
        productError:
          'We could not load products right now. Please try again later.',
      });
    }
  };
}
