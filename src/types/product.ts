export interface Product {
  id: string
  name: string
  category: string
  price: number
  currency: string
  imageUrl?: string
  stockStatus?: 'In stock' | 'Out of stock'
}
