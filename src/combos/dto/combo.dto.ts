export class ComboDto {
  name: string
  products: {
    _id: string
    quantity: number
  }[]
}

export class CalComboDto {
  products: {
    _id: string
    quantity: number
  }[]
  quantity: number
}
