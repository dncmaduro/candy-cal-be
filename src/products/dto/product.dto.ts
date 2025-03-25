export class ProductDto {
  name: string
  items: {
    _id: string
    quantity: number // Updated from string to number
  }[]
}

export class CalProductsDto {
  products: {
    _id: string
    quantity: number
    customers: number
  }[]
}

export class CalXlsxDto {
  file: Express.Multer.File
}
