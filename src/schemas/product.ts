import * as z from 'zod'
import type {
  Product,
  ProductCategory,
  ProductDepartment,
  ProductImage,
  ProductResponse,
  ProductsResponse,
} from '../models/product'

export const ProductImageSchema: z.ZodType<ProductImage> = z.object({
  imageID: z.string(),
  productID: z.string(),
  imageUrl: z.string(),
  imageOrder: z.int().nonnegative(),
})

export const ProductCategorySchema: z.ZodType<ProductCategory> = z.object({
  categoryID: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  departmentID: z.string(),
})

export const ProductDepartmentSchema: z.ZodType<ProductDepartment> = z.object({
  departmentID: z.string(),
  name: z.string(),
  description: z.string().nullable(),
})

export const ProductSchema: z.ZodType<Product> = z.object({
  productID: z.string(),
  salesNo: z.int().nonnegative(),
  name: z.string(),
  description: z.string().nullable(),
  quantity: z.int(),
  draft: z.boolean(),
  visible: z.boolean(),
  weight: z.number(),
  deletedAt: z.string().nullable(),
  categories: z.array(ProductCategorySchema),
  departments: z.array(ProductDepartmentSchema),
  productImages: z.array(ProductImageSchema),
})

export const ProductsResponseSchema: z.ZodType<ProductsResponse> = z.object({
  products: z.array(ProductSchema),
})

export const ProductResponseSchema: z.ZodType<ProductResponse> = z.object({
  product: ProductSchema,
})
