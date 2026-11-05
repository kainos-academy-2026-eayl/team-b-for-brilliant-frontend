import { Router } from 'express';
import { z } from 'zod';
import { saveBrowserState } from '../middleware/browserState';
import { requireAdmin } from '../middleware/requireAdmin';
import { NewProductFormSchema } from '../schemas/newProduct';
import { createProduct, ProductSaveError } from '../services/products';
import { orderProductImages } from '../utils/productImageOrder';

const EMPTY_FORM = {
  name: '', description: '', price: '', quantity: '', weight: '', draft: 'true',
};
const FIELDS = ['name', 'description', 'price', 'quantity', 'weight', 'draft'] as const;

export function createProductCreationRouter(
  saveProduct: typeof createProduct = createProduct,
): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    const productCreated = req.browserState.productCreated === true;
    if (productCreated) {
      delete req.browserState.productCreated;
      saveBrowserState(req, res);
    }
    res.render('products/add.njk', { values: EMPTY_FORM, errors: {}, productCreated });
  });

  router.post('/', async (req, res) => {
    const source = z.record(z.string(), z.unknown()).safeParse(req.body);
    const values = { ...EMPTY_FORM };
    for (const field of FIELDS) {
      const value = source.success ? source.data[field] : undefined;
      values[field] = typeof value === 'string' ? value : '';
    }
    const result = NewProductFormSchema.safeParse(req.body);
    const orderedImages = orderProductImages(
      Array.isArray(req.files) ? req.files : [],
      source.success ? source.data.imageOrder : undefined,
    );
    if (!result.success || res.locals.productUploadError || !orderedImages.success) {
      const errors = {
        ...(!result.success ? z.flattenError(result.error).fieldErrors : {}),
        ...(res.locals.productUploadError
          ? { images: [res.locals.productUploadError] }
          : !orderedImages.success ? { images: [orderedImages.message] } : {}),
      };
      res.status(400).render('products/add.njk', { values, errors, hasErrors: true });
      return;
    }

    // requireAdmin has already verified the identity; never accept a browser-supplied token.
    const token = req.auth?.accessToken;
    if (!token) {
      throw new Error('Admin access token missing after authorization');
    }
    try {
      await saveProduct(token, result.data, orderedImages.images);
    } catch (error) {
      console.error('Saving product failed', error);
      const status = error instanceof ProductSaveError ? error.status : 502;
      if (status === 401 || status === 403) {
        res.redirect(303, '/home');
        return;
      }
      const formError = status === 400
        ? error instanceof ProductSaveError && error.publicMessage
          ? error.publicMessage
          : 'The product details were not accepted. Check the fields below and try again.'
          : 'The product could not be saved right now. Please try again later.';
      res.status(status === 400 ? 400 : 502)
        .render('products/add.njk', {
          values, errors: error instanceof ProductSaveError ? error.fieldErrors ?? {} : {}, formError,
        });
      return;
    }

    req.browserState.productCreated = true;
    saveBrowserState(req, res);
    res.redirect(303, '/products/add');
  });

  return router;
}
