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
  Patch,
  Req,
  Delete,
  Param
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ProductsService, ProductResponse } from "./products.service"
import { ProductDto } from "./dto/product.dto"
import { Product } from "../database/mongoose/schemas/Product"
import { CalItemsResponse } from "./products"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("products")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(
    @Body() product: ProductDto,
    @Req() req
  ): Promise<ProductResponse> {
    const created = await this.productsService.createProduct(product)
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "created",
        entity: "product",
        entityId: created._id.toString(),
        result: "success",
        meta: { name: created.name }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "order-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProduct(
    @Body() product: Product,
    @Req() req
  ): Promise<ProductResponse> {
    const updated = await this.productsService.updateProduct(product)
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "updated",
        entity: "product",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "order-emp")
  @Put("/items")
  @HttpCode(HttpStatus.OK)
  async updateItemsForProduct(
    @Query("productId") productId: string,
    @Body("items") items: Product["items"],
    @Req() req
  ): Promise<ProductResponse> {
    const updated = await this.productsService.updateItemsForProduct(
      productId,
      items
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "items_updated",
        entity: "product",
        entityId: updated._id.toString(),
        result: "success",
        meta: { itemsCount: items?.length }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "order-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllProducts(): Promise<ProductResponse[]> {
    return this.productsService.getAllProducts()
  }

  @Roles("admin", "order-emp", "system-emp")
  @Get("/product")
  @HttpCode(HttpStatus.OK)
  async getProduct(@Query("id") id: string): Promise<ProductResponse> {
    return this.productsService.getProduct(id)
  }

  @Roles("admin", "order-emp", "system-emp", "accounting-emp")
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchProducts(
    @Query("searchText") searchText: string,
    @Query("deleted") deleted?: string
  ): Promise<ProductResponse[]> {
    // Convert string to boolean if provided
    let deletedFilter: boolean | undefined = undefined
    if (deleted === "true") {
      deletedFilter = true
    } else if (deleted === "false") {
      deletedFilter = false
    }

    return this.productsService.searchProducts(searchText, deletedFilter)
  }

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
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<CalItemsResponse> {
    const res = await this.productsService.calFromXlsx({ file })
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "calculated_from_xlsx",
        entity: "xlsx",
        result: "success",
        meta: { size: file?.size }
      },
      req.user.userId
    )
    return res
  }

  @Roles("admin", "order-emp")
  @Patch(":productId/change-ready-status")
  @HttpCode(HttpStatus.OK)
  async changeReadyStatus(
    @Query("productId") productId: string,
    @Req() req
  ): Promise<ProductResponse> {
    const updated = await this.productsService.changeReadyStatus(productId)
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "ready_status_changed",
        entity: "product",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "order-emp")
  @Delete(":productId")
  @HttpCode(HttpStatus.OK)
  async deleteProduct(
    @Param("productId") productId: string,
    @Req() req
  ): Promise<{ message: string }> {
    await this.productsService.deleteProduct(productId)
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "deleted",
        entity: "product",
        entityId: productId,
        result: "success"
      },
      req.user.userId
    )
    return { message: "Sản phẩm đã được xóa thành công" }
  }

  @Roles("admin", "order-emp")
  @Patch(":productId/restore")
  @HttpCode(HttpStatus.OK)
  async restoreProduct(
    @Param("productId") productId: string,
    @Req() req
  ): Promise<{ message: string }> {
    await this.productsService.restoreProduct(productId)
    void this.systemLogsService.createSystemLog(
      {
        type: "products",
        action: "restored",
        entity: "product",
        entityId: productId,
        result: "success"
      },
      req.user.userId
    )
    return { message: "Sản phẩm đã được phục hồi thành công" }
  }
}
