import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import {
  ShopeeItem,
  ShopeeProduct
} from "../database/mongoose/schemas/ShopeeProduct"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import * as XLSX from "xlsx"

type ParsedRow = { sku: string; name?: string; quantity: number }
type ProductItemLean = { _id: Types.ObjectId; quantity: number }
type ProductLean = { name: string; items?: ProductItemLean[] }

type CalOrderProduct = { sku: string; name?: string; quantity: number }
type GroupedOrder = { products: CalOrderProduct[]; quantity: number }

type CalResultItem = {
  _id: string
  quantity: number
  storageItem?: StorageItem | null
}
export type CalResult = {
  items: CalResultItem[]
  orders: GroupedOrder[]
  total: number
}

@Injectable()
export class ShopeeService {
  constructor(
    @InjectModel("shopeeproducts")
    private readonly shopeeProductModel: Model<ShopeeProduct>,
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>
  ) {}

  async createShopeeProduct(
    payload: Partial<ShopeeProduct>
  ): Promise<ShopeeProduct> {
    try {
      const created = new this.shopeeProductModel(payload)
      return await created.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo shopee product",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Consolidated update method: update by id with a partial payload
  async updateShopeeProduct(
    id: string,
    payload: Partial<ShopeeProduct>
  ): Promise<ShopeeProduct> {
    try {
      const updated = await this.shopeeProductModel
        .findByIdAndUpdate(id, payload, { new: true })
        .exec()
      if (!updated)
        throw new HttpException(
          "Không tìm thấy shopee product",
          HttpStatus.NOT_FOUND
        )
      return updated
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật shopee product",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // New: delete shopee product by id
  async deleteShopeeProduct(id: string): Promise<ShopeeProduct> {
    try {
      const deleted = await this.shopeeProductModel.findByIdAndDelete(id).exec()
      if (!deleted)
        throw new HttpException(
          "Không tìm thấy shopee product",
          HttpStatus.NOT_FOUND
        )
      return deleted
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa shopee product",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllShopeeProducts(): Promise<{ products: ShopeeProduct[] }> {
    try {
      return {
        products: await this.shopeeProductModel.find().exec()
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy danh sách shopee products",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeProduct(id: string): Promise<ShopeeProduct> {
    try {
      const doc = await this.shopeeProductModel.findById(id).exec()
      if (!doc)
        throw new HttpException(
          "Shopee product not found",
          HttpStatus.NOT_FOUND
        )
      return doc
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy shopee product",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchShopeeProducts(
    searchText: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: ShopeeProduct[]; total: number }> {
    try {
      const query = searchText
        ? { name: { $regex: `.*${searchText}.*`, $options: "i" } }
        : {}
      const total = await this.shopeeProductModel.countDocuments(query)
      const data = await this.shopeeProductModel
        .find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec()
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm shopee products",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Calculate item quantities from Shopee Excel using headers:
  // "SKU phân loại hàng" (product SKU -> matches ShopeeProduct.name),
  // "Tên sản phẩm" (product name, optional), "Số lượng" (quantity)
  async calFromXlsx(buffer: Buffer): Promise<CalResult> {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const dataRaw = XLSX.utils.sheet_to_json(sheet, {
        header: 1
      }) as unknown[][]
      if (!dataRaw || dataRaw.length === 0) {
        throw new HttpException(
          "File trống hoặc không hợp lệ",
          HttpStatus.BAD_REQUEST
        )
      }
      const headerRow = (dataRaw[0] as unknown[]).map((h) =>
        typeof h === "string" ? h.trim() : undefined
      ) as (string | undefined)[]
      const colSKU = headerRow.indexOf("SKU phân loại hàng")
      const colName = headerRow.indexOf("Tên sản phẩm")
      const colQuantity = headerRow.indexOf("Số lượng")

      if (colSKU === -1 || colQuantity === -1) {
        throw new HttpException(
          "File thiếu cột cần thiết (SKU phân loại hàng hoặc Số lượng)",
          HttpStatus.BAD_REQUEST
        )
      }

      const rows: ParsedRow[] = (dataRaw as unknown[][])
        .slice(1)
        .map((row) => ({
          sku: String((row as unknown[])[colSKU] ?? "").trim(),
          name:
            colName !== -1
              ? String((row as unknown[])[colName] ?? "").trim()
              : undefined,
          quantity: Number((row as unknown[])[colQuantity]) || 0
        }))
        .filter((r) => r.sku && r.quantity > 0)

      // collect unique SKUs
      const skus = Array.from(new Set(rows.map((r) => r.sku)))

      // fetch ShopeeProduct docs by name (matching sku)
      const products = (await this.shopeeProductModel
        .find({ name: { $in: skus } })
        .lean()) as ProductLean[]
      const productMap = new Map(products.map((p) => [p.name, p]))

      // compute storage item quantities
      const itemQuantities: Record<string, number> = {}
      const orderMap: Record<string, CalOrderProduct[]> = {}

      for (const r of rows) {
        const prod = productMap.get(r.sku)
        if (!prod) continue
        for (const it of prod.items || []) {
          const id = it._id.toString()
          itemQuantities[id] =
            (itemQuantities[id] || 0) + (it.quantity || 0) * r.quantity
        }
        // group by product+quantity for simple order grouping (use name+qty key)
        const key = `${r.sku}::${r.quantity}`
        if (!orderMap[key]) orderMap[key] = []
        orderMap[key].push({ sku: r.sku, name: r.name, quantity: r.quantity })
      }

      // Build final orders preserving per-order quantity semantics.
      // Each key in orderMap is "{sku}::{perOrderQuantity}"; orderMap[key].length is number of orders
      // products[0].quantity must be the per-order quantity, outer quantity is number of orders.
      const finalOrders: GroupedOrder[] = Object.entries(orderMap).map(
        ([key, products]) => {
          const [sku, qtyStr] = key.split("::")
          const perQty = Number(qtyStr) || (products[0]?.quantity ?? 0)
          const name = products[0]?.name
          return {
            products: [{ sku, name, quantity: perQty }],
            quantity: products.length
          }
        }
      )

      const total = finalOrders.reduce((s, o) => s + (o.quantity || 0), 0)

      // fetch storage items details (these are the actual storage SKUs)
      const itemIds = Object.keys(itemQuantities)
      const storageItems =
        itemIds.length > 0
          ? ((await this.storageItemModel
              .find({ _id: { $in: itemIds } })
              .lean()) as StorageItem[])
          : []
      const storageMap = new Map(
        storageItems.map((si) => [si._id.toString(), si])
      )

      // Build result items aggregated by storage item, matching products.service shape
      const resultWithStorageItems = itemIds.map((id) => {
        const storage = storageMap.get(id) || null
        return {
          _id: id,
          name: storage ? storage.name : undefined,
          quantity: itemQuantities[id] || 0,
          storageItems: storage ? [storage] : []
        }
      })

      return { items: resultWithStorageItems, orders: finalOrders, total }
    } catch (error) {
      console.error("Error in shopee calFromXlsx:", error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Có lỗi khi xử lý file Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
