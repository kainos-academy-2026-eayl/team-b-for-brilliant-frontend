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

  router.get('/', async (req: Request, res: Response) => {
    if (
      req.query.category !== undefined &&
      typeof req.query.category !== 'string'
    ) {
      res.status(400).render('error.njk', {
        message: 'Select a single category to filter products.',
      });
      return;
    }
    const categoryFilter = (req.query.category ?? '').trim();
    try {
      const products = await fetchProducts();
      const uniqueCategories = Array.from(
        new Map(
          products.flatMap((product) =>
            product.categories.map(
              (category) => [category.categoryID, category] as const,
            ),
          ),
        ).values(),
      ).sort((nameA, nameB) => nameA.name.localeCompare(nameB.name));
      const categoryNameCounts = new Map<string, number>();
      for (const category of uniqueCategories) {
        const name = category.name.trim().toLowerCase();
        categoryNameCounts.set(name, (categoryNameCounts.get(name) ?? 0) + 1);
      }
      const categories = uniqueCategories.map((category) => ({
        ...category,
        label:
          (categoryNameCounts.get(category.name.trim().toLowerCase()) ?? 0) > 1
            ? `${category.name} (ID: ${category.categoryID})`
            : category.name,
      }));
      const selectedCategory = categories.find(
        (category) => category.categoryID === categoryFilter,
      );
      const matchingProducts = categoryFilter
        ? products.filter((product) =>
          product.categories.some(
            (category) => category.categoryID === categoryFilter,
          ),
        )
        : products;
      res.render('products/index.njk', {
        products: matchingProducts,
        categories,
        categoryFilter,
        selectedCategory,
      });
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
