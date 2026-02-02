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
  Req,
  Param,
  Delete
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { CalResult, ShopeeService } from "./shopeeproducts.service"
import { ShopeeProduct } from "../database/mongoose/schemas/ShopeeProduct"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { ShopeeProductDto, CalShopeeXlsxDto } from "./dto/shopeeproducts.dto"
import { Types } from "mongoose"

@Controller("shopeeproducts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeProductsController {
  constructor(
    private readonly shopeeService: ShopeeService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createShopeeProduct(
    @Body() product: ShopeeProductDto,
    @Req() req
  ): Promise<ShopeeProduct> {
    const payload = {
      name: product.name,
      items: (product.items || []).map((it) => ({
        _id: new Types.ObjectId(it._id),
        quantity: it.quantity
      }))
    }
    const created = await this.shopeeService.createShopeeProduct(payload)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopeeproducts",
        action: "created",
        entity: "shopeeproduct",
        entityId: created._id.toString(),
        result: "success",
        meta: { name: created.name }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "order-emp")
  @Put(":productId")
  @HttpCode(HttpStatus.OK)
  async updateShopeeProduct(
    @Param("productId") productId: string,
    @Body() product: ShopeeProductDto,
    @Req() req
  ): Promise<ShopeeProduct> {
    const payload = {
      name: product.name,
      items: (product.items || []).map((it) => ({
        _id: new Types.ObjectId(it._id),
        quantity: it.quantity
      }))
    }
    const updated = await this.shopeeService.updateShopeeProduct(
      productId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "shopeeproducts",
        action: "updated",
        entity: "shopeeproduct",
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
  async deleteShopeeProduct(
    @Param("productId") productId: string,
    @Req() req
  ): Promise<ShopeeProduct> {
    const deleted = await this.shopeeService.deleteShopeeProduct(productId)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopeeproducts",
        action: "deleted",
        entity: "shopeeproduct",
        entityId: deleted._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return deleted
  }

  @Roles("admin", "order-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllShopeeProducts(): Promise<{ products: ShopeeProduct[] }> {
    return this.shopeeService.getAllShopeeProducts()
  }

  @Roles("admin", "order-emp", "system-emp")
  @Get("/product")
  @HttpCode(HttpStatus.OK)
  async getShopeeProduct(@Query("id") id: string): Promise<ShopeeProduct> {
    return this.shopeeService.getShopeeProduct(id)
  }

  @Roles("admin", "order-emp", "system-emp", "accounting-emp")
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchShopeeProducts(
    @Query("searchText") searchText: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Query("deleted") deleted?: string
  ): Promise<{ data: ShopeeProduct[]; total: number }> {
    const p = Number(page) || 1
    const l = Number(limit) || 10
    let deletedFilter: boolean | undefined = undefined
    if (deleted === "true") {
      deletedFilter = true
    } else if (deleted === "false") {
      deletedFilter = false
    }
    return this.shopeeService.searchShopeeProducts(
      searchText,
      p,
      l,
      deletedFilter
    )
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
  ): Promise<CalResult> {
    const res = await this.shopeeService.calFromXlsx(file.buffer)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopeeproducts",
        action: "calculated_from_xlsx",
        entity: "xlsx",
        result: "success",
        meta: { size: file?.size }
      },
      req.user.userId
    )
    return res
  }
}
