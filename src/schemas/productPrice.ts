import * as z from 'zod'
import type { CurrentPriceResponse, ProductPrice } from '../models/productPrice'

export const ProductPriceSchema: z.ZodType<ProductPrice> = z.object({
  priceID: z.string(),
  productID: z.string(),
  price: z.string(),
  createdAt: z.string(),
})

export const CurrentPriceResponseSchema: z.ZodType<CurrentPriceResponse> =
  z.object({
    price: ProductPriceSchema.nullable(),
  })
