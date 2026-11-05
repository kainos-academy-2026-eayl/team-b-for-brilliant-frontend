import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin'
import {
  ProductEditorError,
  type ProductEditorService,
  productEditSchema,
} from '../services/productEditor'

export function createProductEditorRouter(service: ProductEditorService) {
  const router = Router()
  router.use('/:productID/edit', requireAdmin)

  router.get('/:productID/edit', async (req, res) => {
    const token = req.auth?.accessToken
    if (!token) return
    try {
      const context = await service.load(req.params.productID, token)
      res.render('products/edit.njk', {
        ...context,
        saved: req.query.saved === '1',
      })
    } catch (error) {
      console.error('Product editor load failed', error)
      if (error instanceof ProductEditorError && error.status === 404) {
        res.status(404).render('products/not-found.njk')
        return
      }
      res.status(502).render('error.njk', {
        message:
          'We could not load this product for editing. Please try again later.',
      })
    }
  })

  router.post('/:productID/edit', async (req, res) => {
    const token = req.auth?.accessToken
    if (!token) return
    const parsed = productEditSchema.safeParse(req.body)
    const json = req.is('application/json')
    const redirect = `/products/${encodeURIComponent(req.params.productID)}/edit?saved=1`
    let message: string | undefined
    let status = 400
    if (!parsed.success) {
      message = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(' ')
    } else {
      try {
        await service.save(req.params.productID, token, parsed.data)
        if (json) res.json({ redirect })
        else res.redirect(303, redirect)
        return
      } catch (error) {
        console.error('Product editor save failed', error)
        status =
          error instanceof ProductEditorError &&
          [400, 401, 403, 404].includes(error.status)
            ? error.status
            : 502
        message =
          error instanceof ProductEditorError && status !== 502
            ? error.message
            : 'We could not confirm that this product was saved. Reload to check before trying again.'
      }
    }
    if (json) {
      res.status(status).json({ error: message })
      return
    }
    try {
      const context = await service.load(req.params.productID, token)
      res.status(status).render('products/edit.njk', {
        ...context,
        values: {
          ...req.body,
          categoryIDs:
            typeof req.body.categoryIDs === 'string'
              ? [req.body.categoryIDs]
              : (req.body.categoryIDs ?? []),
        },
        errorMessage: message,
      })
    } catch (error) {
      console.error('Product editor reload failed', error)
      res.status(502).render('error.njk', { message })
    }
  })
  return router
}
