import { z } from 'zod';
import { ProductCategorySchema } from '../schemas/product';
import { getApiBaseUrl } from './products';

const CategoryChoiceSchema = ProductCategorySchema.and(z.object({ departmentName: z.string() }));
const CategoriesResponseSchema = z.object({ categories: z.array(CategoryChoiceSchema) });
export type CategoryChoice = z.infer<typeof CategoryChoiceSchema>;

export class CategoriesLoadError extends Error {
  constructor(readonly status: number) {
    super(`Failed to load categories: HTTP ${status}`);
  }
}

export async function getCategories(
  token: string,
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): Promise<CategoryChoice[]> {
  const response = await fetchFn(new URL('/categories', baseUrl), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) throw new CategoriesLoadError(response.status);
  return CategoriesResponseSchema.parse(await response.json()).categories;
}
