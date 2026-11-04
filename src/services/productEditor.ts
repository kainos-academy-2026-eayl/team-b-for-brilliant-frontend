import { z } from 'zod'
import {
  ProductCategorySchema,
  ProductDepartmentSchema,
  ProductSchema,
} from '../schemas/product'
import { getApiBaseUrl } from './products'
import { toProxiedImageUrl } from './images'
import type { Product } from '../models/product'

export const productEditSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z
      .string()
      .max(10000)
      .transform((value) => value.trim() || null),
    quantity: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.int().min(0).max(2_147_483_647)),
    weight: z.string().trim().min(1).transform(Number).pipe(z.number().min(0)),
    price: z
      .string()
      .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
      .transform((value) => Number(value).toFixed(2)),
    publication: z.enum(['visible', 'draft']),
    categoryIDs: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) =>
        value === undefined ? [] : typeof value === 'string' ? [value] : value,
      )
      .pipe(z.array(z.string().min(1)).max(100)),
    images: z
      .array(
        z.union([
          z.object({ imageID: z.string().min(1) }).strict(),
          z
            .object({
              contentType: z.enum([
                'image/png',
                'image/jpeg',
                'image/gif',
                'image/webp',
              ]),
              data: z.string().min(1).max(6990508),
            })
            .strict(),
        ]),
      )
      .max(5)
      .refine((images) => {
        const ids = images.flatMap((image) =>
          'imageID' in image ? [image.imageID] : [],
        )
        return new Set(ids).size === ids.length
      }, 'Choose each existing image once.')
      .optional(),
  })
  .transform(({ publication, ...input }) => ({
    ...input,
    visible: publication === 'visible',
    draft: publication === 'draft',
  }))
export type ProductEdit = z.output<typeof productEditSchema>

const editorSchema = z.object({
  product: ProductSchema,
  currentPrice: z.string().nullable(),
  categories: z.array(ProductCategorySchema),
  departments: z.array(ProductDepartmentSchema),
})
const savedSchema = z.object({
  product: ProductSchema,
  currentPrice: z.string(),
})
const errorSchema = z.object({ error: z.string() })

export class ProductEditorError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ProductEditorError'
  }
}

export function createProductEditorService(
  baseUrl = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
) {
  function proxyImages(product: Product) {
    return {
      ...product,
      productImages: product.productImages
        .flatMap((image) => {
          const imageUrl = toProxiedImageUrl(image.imageUrl, baseUrl)
          return imageUrl ? [{ ...image, imageUrl }] : []
        })
        .sort((first, second) => first.imageOrder - second.imageOrder),
    }
  }
  async function call(productID: string, token: string, input?: ProductEdit) {
    const response = await fetchFn(
      new URL(`/admin/products/${encodeURIComponent(productID)}`, baseUrl),
      {
        method: input ? 'PUT' : 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(input && { 'Content-Type': 'application/json' }),
        },
        ...(input && { body: JSON.stringify(input) }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!response.ok) {
      const message = errorSchema.parse(await response.json()).error
      throw new ProductEditorError(response.status, message)
    }
    return response.json()
  }
  return {
    async load(productID: string, token: string) {
      const result = editorSchema.parse(await call(productID, token))
      return {
        ...result,
        product: {
          ...proxyImages(result.product),
          currentPrice: result.currentPrice,
        },
      }
    },
    async save(productID: string, token: string, input: ProductEdit) {
      return savedSchema.parse(await call(productID, token, input))
    },
  }
}
export type ProductEditorService = ReturnType<typeof createProductEditorService>
