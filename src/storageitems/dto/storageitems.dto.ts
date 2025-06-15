export class StorageItemDto {
  code: string
  name: string
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
}
