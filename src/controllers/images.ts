import { type Request, type Response, Router } from 'express'
import type { ProxiedImage } from '../services/images'

export function createImagesRouter(
  fetchImage: (fileName: string) => Promise<ProxiedImage | null>,
): Router {
  const router = Router()

  router.get(
    '/:fileName',
    async (req: Request<{ fileName: string }>, res: Response) => {
      try {
        const image = await fetchImage(req.params.fileName)

        if (image === null) {
          res.sendStatus(404)
          return
        }

        res
          .set({
            'Content-Type': image.contentType,
            'Cache-Control': image.cacheControl,
            'X-Content-Type-Options': 'nosniff',
            // SVGs can contain scripts; stop them running if the image is opened directly.
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          })
          .send(image.body)
      } catch (error) {
        console.error(error)
        res.sendStatus(502)
      }
    },
  )

  return router
}
