export class ShopeeItemDto {
  _id: string
  quantity: number
}

export class ShopeeProductDto {
  name: string
  items: ShopeeItemDto[]
}

export class CalShopeeXlsxDto {
  file: Express.Multer.File
}
