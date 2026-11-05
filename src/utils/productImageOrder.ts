import { z } from 'zod';

const imageOrderSchema = z.array(z.int().nonnegative()).max(5);
const INVALID_ORDER = 'The image order is invalid. Select your images again and choose their order.';

export function orderProductImages<T>(
  images: readonly T[],
  value: unknown,
): { success: true; images: T[] } | { success: false; message: string } {
  if (value === undefined || value === '') return { success: true, images: [...images] };
  if (typeof value !== 'string') return { success: false, message: INVALID_ORDER };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { success: false, message: INVALID_ORDER };
  }
  const result = imageOrderSchema.safeParse(parsed);
  if (
    !result.success || result.data.length !== images.length ||
    new Set(result.data).size !== images.length ||
    result.data.some((index) => index >= images.length)
  ) {
    return { success: false, message: INVALID_ORDER };
  }
  const ordered: T[] = [];
  for (const index of result.data) {
    const image = images[index];
    if (image === undefined) throw new Error('Validated image order references a missing upload');
    ordered.push(image);
  }
  return { success: true, images: ordered };
}
