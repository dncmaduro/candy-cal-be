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
  UseGuards,
  Patch
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ProductsService } from "./products.service"
import { ProductDto } from "./dto/product.dto"
import { Product } from "../database/mongoose/schemas/Product"
import { CalItemsResponse } from "./products"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"

@Controller("products")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() product: ProductDto): Promise<Product> {
    return this.productsService.createProduct(product)
  }

  @Roles("admin", "order-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProduct(@Body() product: Product): Promise<Product> {
    return this.productsService.updateProduct(product)
  }

  @Roles("admin", "order-emp")
  @Put("/items")
  @HttpCode(HttpStatus.OK)
  async updateItemsForProduct(
    @Query("productId") productId: string,
    @Body("items") items: Product["items"]
  ): Promise<Product> {
    return this.productsService.updateItemsForProduct(productId, items)
  }

  @Roles("admin", "order-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllProducts(): Promise<Product[]> {
    return this.productsService.getAllProducts()
  }

  @Roles("admin", "order-emp")
  @Get("/product")
  @HttpCode(HttpStatus.OK)
  async getProduct(@Query("id") id: string): Promise<Product> {
    return this.productsService.getProduct(id)
  }

  @Roles("admin", "order-emp")
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

  @Roles("admin", "order-emp")
  @Post("/cal-xlsx")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 50 * 1024 * 1024 // 50 MB
      }
    })
  )
  async calXlsx(
    @UploadedFile() file: Express.Multer.File
  ): Promise<CalItemsResponse> {
    return this.productsService.calFromXlsx({ file })
  }

  @Roles("admin", "order-emp")
  @Patch(":productId/change-ready-status")
  @HttpCode(HttpStatus.OK)
  async changeReadyStatus(
    @Query("productId") productId: string
  ): Promise<Product> {
    return this.productsService.changeReadyStatus(productId)
  }
}
