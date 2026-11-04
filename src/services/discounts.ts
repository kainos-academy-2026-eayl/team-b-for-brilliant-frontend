import type { Discount } from '../models/discount';
import { DiscountsResponseSchema } from '../schemas/discount';
import { getApiBaseUrl } from './products';

export interface NewDiscount {
  code: string;
  type: 'percentage' | 'amount';
  value: string;
  expiryDate: string;
}

export class DiscountSaveError extends Error {
  constructor(readonly status: number) {
    super(`Failed to save discount: HTTP ${status}`);
  }
}

const BACKEND_TYPES = { percentage: 'PERCENTAGE', amount: 'AMOUNT_OFF' } as const;

export async function createDiscount(
  token: string | undefined,
  discount: NewDiscount,
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = ['Bearer', token].join(' ');

  const response = await fetchFn(new URL('/discounts', baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...discount, type: BACKEND_TYPES[discount.type] }),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new DiscountSaveError(response.status);
  }
}

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
