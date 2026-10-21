import * as z from 'zod'

export const ProductPriceSchema = z.object({
  priceID: z.string(),
  productID: z.string(),
  price: z.string(),
  createdAt: z.string(),
})

export const CurrentPriceResponseSchema = z.object({
  price: ProductPriceSchema.nullable(),
})

export type ProductPrice = z.infer<typeof ProductPriceSchema>
export type CurrentPriceResponse = z.infer<typeof CurrentPriceResponseSchema>
