import { Product } from "src/database/mongoose/schemas/Product"
import { CalProductsDto, CalXlsxDto, ProductDto } from "./dto/product.dto"
import { CalItemsResponse } from "src/combos/combos"

export interface IProductsService {
  createProduct(product: ProductDto): Promise<Product>
  updateProduct(product: Product): Promise<Product>
  updateItemsForProduct(
    productId: string,
    items: Product["items"]
  ): Promise<Product>
  getAllProducts(): Promise<Product[]>
  getProduct(id: string): Promise<Product>
  searchProducts(searchText: string): Promise<Product[]>
  calToItems(combos: CalProductsDto): Promise<CalItemsResponse[]>
  calFromXlsx(dto: CalXlsxDto): Promise<CalItemsResponse[]>
}
