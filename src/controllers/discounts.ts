import { type Request, type Response, Router } from 'express';
import type { Discount } from '../models/discount';
import { getDiscounts } from '../services/discounts';

export function createDiscountsRouter(
  fetchDiscounts: (token?: string) => Promise<Discount[]> = getDiscounts,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const token = req.session.accountToken;
    try {
      const discounts = await fetchDiscounts(token);
      res.render('discounts/index.njk', { discounts });
    } catch (error) {
      console.error(error);
      res.status(502).render('discounts/unavailable.njk');
    }
  });

  router.get('/add', (_req: Request, res: Response) => {
    res.render('discounts/add.njk');
  });

  return router;
}
