import { type Request, type Response, Router } from 'express';
import type { Discount } from '../models/discount';
import {
  activateDiscount,
  createDiscount,
  DiscountSaveError,
  deactivateDiscount,
  getDiscounts,
} from '../services/discounts';
import {
  EMPTY_DISCOUNT_FORM,
  isDiscountActive,
  readDiscountForm,
  validateDiscount,
  validateReactivationDate,
} from '../utils/discountValidation';

function updateErrorMessage(error: unknown): string {
  const status = error instanceof DiscountSaveError ? error.status : 0;
  return status === 401 || status === 403
    ? 'You do not have permission to change discounts. Please sign in as an admin and try again.'
    : status === 404
      ? 'This discount no longer exists.'
      : status === 400
        ? 'The expiry date was not accepted. Check it and try again.'
        : 'The discount could not be updated right now. Please try again later.';
}

function withStatus(discounts: Discount[]) {
  return discounts.map((item) => ({
    ...item,
    isActive: isDiscountActive(item.expiryDate),
  }));
}

export function createDiscountsRouter(
  fetchDiscounts: (token?: string) => Promise<Discount[]> = getDiscounts,
  saveDiscount: typeof createDiscount = createDiscount,
  activate: typeof activateDiscount = activateDiscount,
  deactivate: typeof deactivateDiscount = deactivateDiscount,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const token = req.auth?.accessToken;
    try {
      const discounts = await fetchDiscounts(token);
      res.render('discounts/index.njk', { discounts: withStatus(discounts) });
    } catch (error) {
      console.error(error);
      res.status(502).render('discounts/unavailable.njk');
    }
  });

  router.get('/add', (_req: Request, res: Response) => {
    res.render('discounts/add.njk', {
      values: EMPTY_DISCOUNT_FORM,
      errors: {},
    });
  });

  router.post('/add', async (req: Request, res: Response) => {
    const values = readDiscountForm(req.body);
    const errors = validateDiscount(values);

    if (Object.keys(errors).length > 0) {
      res.status(400).render('discounts/add.njk', { values, errors });
      return;
    }

    try {
      await saveDiscount(req.session.accountToken, {
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
      res
        .status(status === 409 || status === 400 ? 400 : 502)
        .render('discounts/add.njk', {
          values,
          errors: status === 409 ? { code: formError } : {},
          formError: status === 409 ? undefined : formError,
        });
      return;
    }

    res.redirect(303, '/discounts');
  });

  router.post('/:id/deactivate', async (req: Request, res: Response) => {
    const token = req.auth?.accessToken;
    try {
      await deactivate(token, String(req.params.id));
    } catch (error) {
      console.error('Deactivating discount failed', error);
      const discounts = await fetchDiscounts(token).catch(() => []);
      res
        .status(
          error instanceof DiscountSaveError && error.status === 404
            ? 404
            : 502,
        )
        .render('discounts/index.njk', {
          discounts: withStatus(discounts),
          formError: updateErrorMessage(error),
        });
      return;
    }
    res.redirect(303, '/discounts');
  });

  router.get('/:id/activate', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      const discounts = await fetchDiscounts(req.auth?.accessToken);
      const discount = discounts.find((item) => item.discountID === req.params.id);
      if (!discount) {
        res.redirect(303, '/discounts');
        return;
      }
      res.render('discounts/activate.njk', {
        discount,
        values: { expiryDate: '' },
        errors: {},
      });
    } catch (error) {
      console.error(error);
      res.status(502).render('discounts/unavailable.njk');
    }
  });

  router.post('/:id/activate', async (req: Request, res: Response) => {
    const token = req.auth?.accessToken;
    const discountID = String(req.params.id);
    const { expiryDate } = readDiscountForm(req.body);

    let discount: Discount | undefined;
    try {
      discount = (await fetchDiscounts(token)).find(
        (item) => item.discountID === discountID,
      );
    } catch (error) {
      console.error(error);
      res.status(502).render('discounts/unavailable.njk');
      return;
    }
    if (!discount) {
      res.redirect(303, '/discounts');
      return;
    }

    const expiryError = validateReactivationDate(expiryDate);
    if (expiryError) {
      res.status(400).render('discounts/activate.njk', {
        discount,
        values: { expiryDate },
        errors: { expiryDate: expiryError },
      });
      return;
    }

    try {
      await activate(token, discountID, expiryDate);
    } catch (error) {
      console.error('Activating discount failed', error);
      res.status(502).render('discounts/activate.njk', {
        discount,
        values: { expiryDate },
        errors: {},
        formError: updateErrorMessage(error),
      });
      return;
    }
    res.redirect(303, '/discounts');
  });

  return router;
}
