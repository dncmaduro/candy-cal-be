export interface CalItemsResponse {
  items: {
    _id: string
    quantity: number
  }[]
  orders: {
    products: {
      name: string
      quantity: number
    }[]
    quantity: number
  }[]
  total: number
}

export interface XlsxData {
  "Seller SKU": string
  "Order IO": string
  Quantity: number
}
