import type { Product, ProductWithPrice } from '../models/product'
import { ProductsResponseSchema } from '../schemas/product'
import { toProxiedImageUrl } from './images'
import { getCurrentPrice } from './productPrices'

export const DEFAULT_API_BASE_URL = 'http://localhost:3001'

export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || DEFAULT_API_BASE_URL
}

export async function getProducts(
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): Promise<Product[]> {
  const response = await fetchFn(new URL('/products', baseUrl), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch products: HTTP ${response.status}`)
  }

  // Validate the raw JSON so the rest of the code can rely on the ProductsResponse model.
  const result = ProductsResponseSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('Products response from backend did not match schema')
  }

  // Image URLs are rewritten to frontend paths so the browser never contacts the backend directly.
  return result.data.products
    .filter((product) => product.visible)
    .map((product) => ({
      ...product,
      productImages: product.productImages.flatMap((image) => {
        const imageUrl = toProxiedImageUrl(image.imageUrl, baseUrl)
        return imageUrl === null ? [] : [{ ...image, imageUrl }]
      }),
    }))
}

export async function getProductsWithPrices(
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): Promise<ProductWithPrice[]> {
  const products = await getProducts(baseUrl, fetchFn)

  return Promise.all(
    products.map(async (product) => {
      try {
        const currentPrice = await getCurrentPrice(
          product.productID,
          baseUrl,
          fetchFn,
        )
        return { ...product, currentPrice }
      } catch (error) {
        // A missing price shouldn't take down the whole page; show the product without one.
        console.error(error)
        return { ...product, currentPrice: null }
      }
    }),
  )
}
