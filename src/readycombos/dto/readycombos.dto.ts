export class ReadyComboDto {
  products: {
    _id: string
    quantity: number
  }[]
  isReady: boolean
  note?: string
}
