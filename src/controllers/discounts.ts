import { type Request, type Response, Router } from 'express';
import type { Discount } from '../models/discount';
import { createDiscount, DiscountSaveError, getDiscounts } from '../services/discounts';
import {
  EMPTY_DISCOUNT_FORM,
  readDiscountForm,
  validateDiscount,
} from '../utils/discountValidation';

export function createDiscountsRouter(
  fetchDiscounts: (token?: string) => Promise<Discount[]> = getDiscounts,
  saveDiscount: typeof createDiscount = createDiscount,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const token = req.auth?.accessToken;
    try {
      const discounts = await fetchDiscounts(token);
      res.render('discounts/index.njk', { discounts });
    } catch (error) {
      console.error(error);
      res.status(502).render('discounts/unavailable.njk');
    }
  });

  router.get('/add', (_req: Request, res: Response) => {
    res.render('discounts/add.njk', { values: EMPTY_DISCOUNT_FORM, errors: {} });
  });

  router.post('/add', async (req: Request, res: Response) => {
    const values = readDiscountForm(req.body);
    const errors = validateDiscount(values);

    if (Object.keys(errors).length > 0) {
      res.status(400).render('discounts/add.njk', { values, errors });
      return;
    }

    try {
      await saveDiscount(req.auth?.accessToken, {
        code: values.code,
        type: values.type as 'percentage' | 'amount',
        value: values.value,
        expiryDate: values.expiryDate,
      });
    } catch (error) {
      console.error('Saving discount failed', error);
      const status = error instanceof DiscountSaveError ? error.status : 0;
      const formError =
        status === 401 || status === 403
          ? 'You do not have permission to add discounts. Please sign in as an admin and try again.'
          : status === 409
            ? 'A discount with this code already exists. Choose a different code.'
            : status === 400
              ? 'The discount details were not accepted. Check the fields below and try again.'
              : 'The discount could not be saved right now. Please try again later.';
      res.status(status === 409 || status === 400 ? 400 : 502).render('discounts/add.njk', {
        values,
        errors: status === 409 ? { code: formError } : {},
        formError: status === 409 ? undefined : formError,
      });
      return;
    }

    res.redirect(303, '/discounts');
  });

  return router;
}
