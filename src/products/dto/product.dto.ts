export class ProductDto {
  name: string
  items: {
    _id: string
    quantity: number // Updated from string to number
  }[]
}
