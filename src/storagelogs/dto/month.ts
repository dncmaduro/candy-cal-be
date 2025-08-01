export interface GetMonthStorageLogsReponse {
  items: {
    _id: string
    name: string
    deliveredQuantity: number
    receivedQuantity: number
  }[]
  byDay: {
    day: number
    items: {
      _id: string
      name: string
      deliveredQuantity: number
      receivedQuantity: number
    }[]
  }[]
}
