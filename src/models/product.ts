export interface ProductImage {
  imageID: string
  productID: string
  imageUrl: string
}

export interface Product {
  productID: string
  name: string
  description: string | null
  quantity: number
  draft: boolean
  visible: boolean
  weight: number
  deletedAt: string | null
  productImages: ProductImage[]
}

export interface ProductsResponse {
  products: Product[]
}

export interface ProductWithPrice extends Product {
  currentPrice: string | null
}
