export class DeliveredRequestDto {
  date: Date
  items: {
    _id: string
    quantity: number
  }[]
  note?: string
}
