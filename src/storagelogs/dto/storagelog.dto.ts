export class StorageLogDto {
  items: {
    _id: string
    quantity: number
  }[]
  note?: string
  status: string
  date: Date
  tag?: string
  deliveredRequestId?: string
}
