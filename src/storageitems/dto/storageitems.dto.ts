export class StorageItemDto {
  code: string
  name: string
  quantityPerBox: number
  receivedQuantity: {
    quantity: number
    real: number
  }
  deliveredQuantity: {
    quantity: number
    real: number
  }
  restQuantity: {
    quantity: number
    real: number
  }
  note?: string
  // optional deletion timestamp (null or undefined means not deleted)
  deletedAt?: Date
}
