export class ComboDto {
  name: string
  products: {
    _id: string
    quantity: number
  }[]
}
