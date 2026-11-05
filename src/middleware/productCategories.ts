import type { RequestHandler } from 'express';
import { CategoriesLoadError, type getCategories } from '../services/categories';

export function loadProductCategories(fetchCategories: typeof getCategories): RequestHandler {
  return async (req, res, next) => {
    if (!req.auth) throw new Error('Admin identity missing while loading product categories');
    try {
      req.productCategories = await fetchCategories(req.auth.accessToken);
    } catch (error) {
      console.error('Loading product categories failed', error);
      if (error instanceof CategoriesLoadError && (error.status === 401 || error.status === 403)) {
        res.redirect(req.method === 'GET' ? 302 : 303, '/home');
        return;
      }
      res.status(502).render('error.njk', {
        message: 'We could not load product categories right now. Please go back and try again later.',
      });
      return;
    }
    next();
  };
}
