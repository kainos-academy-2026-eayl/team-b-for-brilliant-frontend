export interface ProductImage {
  imageID: string
  productID: string
  imageUrl: string
  imageOrder: number
}

export interface ProductCategory {
  categoryID: string
  name: string
  description: string | null
  departmentID: string
}

export interface ProductDepartment {
  departmentID: string
  name: string
  description: string | null
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
  categories: ProductCategory[]
  departments: ProductDepartment[]
  productImages: ProductImage[]
}

export interface ProductsResponse {
  products: Product[]
}

export interface ProductResponse {
  product: Product
}

export interface ProductWithPrice extends Product {
  currentPrice: string | null
}
