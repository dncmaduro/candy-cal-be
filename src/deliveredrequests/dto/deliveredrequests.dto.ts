export class DeliveredRequestDto {
  date: Date
  channelId?: string
  items: {
    _id: string
    quantity: number
  }[]
  note?: string
}
