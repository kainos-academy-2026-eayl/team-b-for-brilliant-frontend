import type { Discount } from '../models/discount';
import { DiscountsResponseSchema } from '../schemas/discount';
import { getApiBaseUrl } from './products';

export async function getDiscounts(
  token?: string,
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): Promise<Discount[]> {
  const response = await fetchFn(new URL('/discounts', baseUrl), {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch discounts: HTTP ${response.status}`);
  }

  const result = DiscountsResponseSchema.safeParse(await response.json());
  if (!result.success) {
    throw new Error('Discounts response from backend did not match schema');
  }

  return result.data.discounts;
}
