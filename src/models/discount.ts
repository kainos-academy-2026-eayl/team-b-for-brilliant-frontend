export interface Discount {
  discountID: string
  code: string
  type: string
  value: string
  expiryDate: string
}

export interface DiscountsResponse {
  discounts: Discount[]
}
