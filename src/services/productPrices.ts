import { CurrentPriceResponseSchema } from '../schemas/productPrice'

export async function getCurrentPrice(
  productID: string,
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const url = new URL(
    `/products/${encodeURIComponent(productID)}/prices/current`,
    baseUrl,
  )
  const response = await fetchFn(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch price for product ${productID}: HTTP ${response.status}`,
    )
  }

  // Validate the raw JSON so the rest of the code can rely on the CurrentPriceResponse model.
  const result = CurrentPriceResponseSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('Price response from backend did not match schema')
  }

  return result.data.price?.price ?? null
}
