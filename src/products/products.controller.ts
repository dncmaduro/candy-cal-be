import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query
} from "@nestjs/common"
import { ProductsService } from "./products.service"
import { ProductDto } from "./dto/product.dto"
import { Product } from "src/database/mongoose/schemas/Product"

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() product: ProductDto): Promise<Product> {
    return this.productsService.createProduct(product)
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProduct(@Body() product: Product): Promise<Product> {
    return this.productsService.updateProduct(product)
  }

  @Put("/items")
  @HttpCode(HttpStatus.OK)
  async updateItemsForProduct(
    @Query("productId") productId: string,
    @Body("items") items: Product["items"]
  ): Promise<Product> {
    return this.productsService.updateItemsForProduct(productId, items)
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllProducts(): Promise<Product[]> {
    return this.productsService.getAllProducts()
  }

  @Get("/product")
  @HttpCode(HttpStatus.OK)
  async getProduct(@Query("id") id: string): Promise<Product> {
    return this.productsService.getProduct(id)
  }

  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchProducts(
    @Query("searchText") searchText: string
  ): Promise<Product[]> {
    return this.productsService.searchProducts(searchText)
  }
}
