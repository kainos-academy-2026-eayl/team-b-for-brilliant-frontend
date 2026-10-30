import * as z from 'zod'
import type { Discount, DiscountsResponse } from '../models/discount'

export const DiscountSchema: z.ZodType<Discount> = z.object({
  discountID: z.string(),
  code: z.string(),
  type: z.string(),
  value: z.string(),
  expiryDate: z.string(),
})

export const DiscountsResponseSchema: z.ZodType<DiscountsResponse> = z.object({
  discounts: z.array(DiscountSchema),
})
