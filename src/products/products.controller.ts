import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ProductsService } from "./products.service"
import { CalProductsDto, CalXlsxDto, ProductDto } from "./dto/product.dto"
import { Product } from "src/database/mongoose/schemas/Product"
import { CalItemsResponse } from "./products"
import { JwtAuthGuard } from "src/auth/jwt-auth-guard"

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() product: ProductDto): Promise<Product> {
    return this.productsService.createProduct(product)
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProduct(@Body() product: Product): Promise<Product> {
    return this.productsService.updateProduct(product)
  }

  @UseGuards(JwtAuthGuard)
  @Put("/items")
  @HttpCode(HttpStatus.OK)
  async updateItemsForProduct(
    @Query("productId") productId: string,
    @Body("items") items: Product["items"]
  ): Promise<Product> {
    return this.productsService.updateItemsForProduct(productId, items)
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllProducts(): Promise<Product[]> {
    return this.productsService.getAllProducts()
  }

  @UseGuards(JwtAuthGuard)
  @Get("/product")
  @HttpCode(HttpStatus.OK)
  async getProduct(@Query("id") id: string): Promise<Product> {
    return this.productsService.getProduct(id)
  }

  @UseGuards(JwtAuthGuard)
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchProducts(
    @Query("searchText") searchText: string
  ): Promise<Product[]> {
    return this.productsService.searchProducts(searchText)
  }

  // @Post("/cal")
  // @HttpCode(HttpStatus.OK)
  // async calToItems(
  //   @Body() products: CalProductsDto
  // ): Promise<CalItemsResponse[]> {
  //   return this.productsService.calToItems(products)
  // }

  @UseGuards(JwtAuthGuard)
  @Post("/cal-xlsx")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  async calXlsx(
    @UploadedFile() file: Express.Multer.File
  ): Promise<CalItemsResponse> {
    return this.productsService.calFromXlsx({ file })
  }
}
