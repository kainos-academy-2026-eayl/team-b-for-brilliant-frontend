import type { Product, ProductWithPrice } from '../models/product'
import {
  ProductResponseSchema,
  ProductsResponseSchema,
} from '../schemas/product'
import { mapWithConcurrency } from '../utils/concurrency'
import { toProxiedImageUrl } from './images'
import { getCurrentPrice } from './productPrices'

export const DEFAULT_API_BASE_URL = 'http://localhost:3001'
export const DEFAULT_PRICE_FETCH_CONCURRENCY = 5

export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || DEFAULT_API_BASE_URL
}

export function getPriceFetchConcurrency(): number {
  const raw = process.env.PRICE_FETCH_CONCURRENCY
  if (!raw) {
    return DEFAULT_PRICE_FETCH_CONCURRENCY
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid PRICE_FETCH_CONCURRENCY: ${raw}`)
  }
  return value
}

function withProxiedImages(product: Product, baseUrl: string): Product {
  return {
    ...product,
    productImages: product.productImages
      .flatMap((image) => {
        const imageUrl = toProxiedImageUrl(image.imageUrl, baseUrl)
        return imageUrl === null ? [] : [{ ...image, imageUrl }]
      })
      .sort((a, b) => a.imageOrder - b.imageOrder),
  }
}

async function withCurrentPrice(
  product: Product,
  baseUrl: string,
  fetchFn: typeof fetch,
): Promise<ProductWithPrice> {
  try {
    const currentPrice = await getCurrentPrice(
      product.productID,
      baseUrl,
      fetchFn,
    )
    return { ...product, currentPrice }
  } catch (error) {
    console.error(error)
    return { ...product, currentPrice: null }
  }
}

export async function getProductWithPrice(
  productID: string,
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): Promise<ProductWithPrice | null> {
  const response = await fetchFn(
    new URL(`/products/${encodeURIComponent(productID)}`, baseUrl),
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  )

  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch product: HTTP ${response.status}`)
  }

  const result = ProductResponseSchema.safeParse(await response.json())
  if (!result.success) {
    throw new Error('Product response from backend did not match schema')
  }
  if (!result.data.product.visible) {
    return null
  }

  return withCurrentPrice(
    withProxiedImages(result.data.product, baseUrl),
    baseUrl,
    fetchFn,
  )
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
    .map((product) => withProxiedImages(product, baseUrl))
}

export async function getProductsWithPrices(
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
  concurrency: number = getPriceFetchConcurrency(),
): Promise<ProductWithPrice[]> {
  const products = await getProducts(baseUrl, fetchFn)

  return mapWithConcurrency(products, concurrency, (product) =>
    withCurrentPrice(product, baseUrl, fetchFn),
  )
}
