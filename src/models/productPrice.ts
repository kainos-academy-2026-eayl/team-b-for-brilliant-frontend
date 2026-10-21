export interface ProductPrice {
  priceID: string
  productID: string
  price: string
  createdAt: string
}

export interface CurrentPriceResponse {
  price: ProductPrice | null
}
