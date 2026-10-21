import * as z from 'zod'
import type { Product, ProductImage, ProductsResponse } from '../models/product'

export const ProductImageSchema: z.ZodType<ProductImage> = z.object({
  imageID: z.string(),
  productID: z.string(),
  imageUrl: z.string(),
})

export const ProductSchema: z.ZodType<Product> = z.object({
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

export const ProductsResponseSchema: z.ZodType<ProductsResponse> = z.object({
  products: z.array(ProductSchema),
})
