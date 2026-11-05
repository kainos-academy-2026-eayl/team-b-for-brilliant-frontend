import { type Request, type Response, Router } from 'express';
import type { Product, ProductWithPrice } from '../models/product';
import { getProducts, getProductWithPrice, type ProductFilters } from '../services/products';

export function createProductsRouter(
  fetchProducts: (filters?: ProductFilters) => Promise<ProductWithPrice[]>,
  fetchProduct: (
    productID: string,
  ) => Promise<ProductWithPrice | null> = getProductWithPrice,
  fetchCategoryProducts: () => Promise<Product[]> = getProducts,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    // Repeated or nested query parameters are not valid category selections.
    if (
      req.query.category !== undefined &&
      typeof req.query.category !== 'string'
    ) {
      res.status(400).render('error.njk', {
        message: 'Select a single category to filter products.',
      });
      return;
    }
    // Accept one text value, not arrays or objects from repeated/nested parameters.
    if (req.query.q !== undefined && typeof req.query.q !== 'string') {
      res.status(400).render('error.njk', {
        message: 'Enter a single product name to search.',
      });
      return;
    }

    // Trim form input, leaving name matching and category filtering to the backend.
    const searchQuery = (req.query.q ?? '').trim();
    const categoryFilter = (req.query.category ?? '').trim();
    try {
      // Send active filters to the service; do not filter the returned products here.
      const filters: ProductFilters = {};
      if (searchQuery) filters.q = searchQuery;
      if (categoryFilter) filters.category = categoryFilter;
      const products = await fetchProducts(filters);
      // Use the full catalogue for dropdown options, without fetching its prices again.
      const categoryProducts = searchQuery || categoryFilter
        ? await fetchCategoryProducts()
        : products;
      // Keep each category ID once, even when several products share it.
      const uniqueCategories = Array.from(
        new Map(
          categoryProducts.flatMap((product) =>
            product.categories.map(
              (category) => [category.categoryID, category] as const,
            ),
          ),
        ).values(),
      ).sort((nameA, nameB) => nameA.name.localeCompare(nameB.name));
      // Count names without case or surrounding spaces to spot ambiguous labels.
      const categoryNameCounts = new Map<string, number>();
      for (const category of uniqueCategories) {
        const name = category.name.trim().toLowerCase();
        categoryNameCounts.set(name, (categoryNameCounts.get(name) ?? 0) + 1);
      }
      // Include IDs only when different categories share the same name.
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
      // Return the active filters so both forms retain them after navigation.
      res.render('products/index.njk', {
        products,
        categories,
        categoryFilter,
        selectedCategory,
        searchQuery,
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
    // Fetch current stock and price rather than reuse a cached detail page.
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
