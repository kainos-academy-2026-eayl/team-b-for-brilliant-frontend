import { z } from 'zod';

export const NewProductFormSchema = z.object({
  name: z.string('Enter a product name.').trim().min(1, 'Enter a product name.'),
  description: z.string('Enter a description as text.').trim().default('')
    .transform((value) => value || null),
  price: z.string('Enter a price.').trim()
    .regex(/^\d{1,8}(?:\.\d{1,2})?$/, 'Enter a price from 0 to 99999999.99, with up to 2 decimal places.'),
  quantity: z.string('Enter a quantity.').trim()
    .regex(/^\d+$/, 'Enter a whole number from 0 to 2147483647.')
    .transform(Number)
    .pipe(z.int().min(0).max(2_147_483_647, 'Enter a whole number from 0 to 2147483647.')),
  weight: z.string('Enter a weight.').trim()
    .regex(/^\d+(?:\.\d+)?$/, 'Enter a number greater than or equal to 0.')
    .transform(Number)
    .pipe(z.number('Enter a finite number greater than or equal to 0.').min(0)),
  draft: z.enum(['true', 'false'], 'Select a draft status.')
    .transform((value) => value === 'true'),
});

export type NewProduct = z.output<typeof NewProductFormSchema>;
