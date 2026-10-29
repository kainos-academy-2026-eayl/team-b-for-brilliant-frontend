export interface OrderItem {
  productID: string
  productName: string
  quantity: number
  unitPrice: string
  lineTotal: string
}

export interface Order {
  orderID: string
  placedAt: string
  items: OrderItem[]
  total: string
}
