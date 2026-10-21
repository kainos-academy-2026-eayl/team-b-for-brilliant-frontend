import * as z from 'zod'

export const ProductImageSchema = z.object({
  imageID: z.string(),
  productID: z.string(),
  imageUrl: z.string(),
})

export const ProductSchema = z.object({
  productID: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  quantity: z.int(),
  draft: z.boolean(),
  visible: z.boolean(),
  weight: z.number(),
  deletedAt: z.string().nullable(),
  productImages: z.array(ProductImageSchema),
})

export const ProductsResponseSchema = z.object({
  products: z.array(ProductSchema),
})

export type ProductImage = z.infer<typeof ProductImageSchema>
export type Product = z.infer<typeof ProductSchema>
export type ProductsResponse = z.infer<typeof ProductsResponseSchema>

export type ProductWithPrice = Product & { currentPrice: string | null }
