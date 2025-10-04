import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { CalItemsResponse, XlsxData } from "./products"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Product } from "../database/mongoose/schemas/Product"
import { CalXlsxDto, ProductDto } from "./dto/product.dto"
import * as XLSX from "xlsx"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"

// Type for limited Product response
export type ProductResponse = Pick<Product, "name" | "items" | "_id">

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel("products")
    private readonly productModel: Model<Product>,
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>
  ) {}

  async createProduct(product: ProductDto): Promise<ProductResponse> {
    try {
      const newProduct = new this.productModel(product)
      const saved = await newProduct.save()
      return {
        _id: saved._id,
        name: saved.name,
        items: saved.items
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateProduct(product: Product): Promise<ProductResponse> {
    try {
      const updatedProduct = await this.productModel.findOneAndUpdate(
        { _id: product._id, deletedAt: null },
        product,
        { new: true, select: "name items" }
      )

      if (!updatedProduct) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }

      return {
        _id: updatedProduct._id,
        name: updatedProduct.name,
        items: updatedProduct.items
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateItemsForProduct(
    productId: string,
    items: Product["items"]
  ): Promise<ProductResponse> {
    try {
      const updatedProduct = await this.productModel.findOneAndUpdate(
        { _id: productId, deletedAt: null },
        { items },
        { new: true, select: "name items" }
      )

      if (!updatedProduct) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }

      return {
        _id: updatedProduct._id,
        name: updatedProduct.name,
        items: updatedProduct.items
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllProducts(): Promise<ProductResponse[]> {
    try {
      return await this.productModel
        .find({ deletedAt: null }, "name items")
        .lean()
        .exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy danh sách sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getProduct(id: string): Promise<ProductResponse> {
    try {
      const product = await this.productModel
        .findOne({ _id: id, deletedAt: null }, "name items")
        .lean()
        .exec()

      if (!product) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }

      return product
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchProducts(
    searchText: string,
    deleted?: boolean
  ): Promise<ProductResponse[]> {
    try {
      // Build filter condition based on deleted parameter
      let deletedFilter = {}
      if (deleted === true) {
        deletedFilter = { deletedAt: { $ne: null } } // Only deleted products
      } else if (deleted === false) {
        deletedFilter = { deletedAt: null } // Only active products
      }
      // If deleted is undefined, search in both active and deleted products

      const products = await this.productModel
        .find(
          {
            name: { $regex: `.*${searchText}.*`, $options: "i" },
            ...deletedFilter
          },
          "name items"
        )
        .lean()
        .exec()
      return products
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm kiếm sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // async calToItems(products: CalProductsDto): Promise<CalItemsResponse[]> {
  //   try {
  //     const itemQuantities: Record<string, number> = {}

  //     for (const p of products.products) {
  //       const product = await this.productModel.findById(p._id).exec()
  //       if (product) {
  //         for (const item of product.items) {
  //           console.log("id: ", item._id.toString())
  //           if (!itemQuantities[item._id.toString()]) {
  //             itemQuantities[item._id.toString()] = 0
  //           }
  //           itemQuantities[item._id.toString()] +=
  //             item.quantity * p.quantity * p.customers
  //         }
  //       }
  //     }

  //     return Object.entries(itemQuantities).map(([itemId, quantity]) => ({
  //       _id: itemId,
  //       quantity,
  //       orders: []
  //     }))
  //   } catch (error) {
  //     console.error(error)
  //     throw new HttpException(
  //       "Internal server error",
  //       HttpStatus.INTERNAL_SERVER_ERROR
  //     )
  //   }
  // }

  async changeReadyStatus(productId: string): Promise<ProductResponse> {
    try {
      const product = await this.productModel
        .findOne({ _id: productId, deletedAt: null }, "name items")
        .exec()
      if (!product) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }
      await product.save()
      return {
        _id: product._id,
        name: product.name,
        items: product.items
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi thay đổi trạng thái sẵn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async calFromXlsx(dto: CalXlsxDto): Promise<CalItemsResponse> {
    try {
      // 1. Đọc file, chỉ lấy các trường cần thiết
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const dataRaw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      const headerRow = dataRaw[0]
      const colSellerSKU = headerRow.indexOf("Seller SKU")
      const colQuantity = headerRow.indexOf("Quantity")
      const colOrderId = headerRow.indexOf("Order ID")
      const colOrderStatus = headerRow.indexOf("Order Status")
      if (colSellerSKU === -1 || colQuantity === -1 || colOrderId === -1)
        throw new HttpException("File thiếu cột", HttpStatus.BAD_REQUEST)

      const data = dataRaw
        .slice(1)
        // Bỏ các đơn có trạng thái "Đã hủy"
        .filter((row) => {
          if (colOrderStatus !== -1) {
            const status = String(row[colOrderStatus] || "").trim()
            if (status === "Đã hủy") return false
          }
          return true
        })
        .map((row) => ({
          sellerSKU: row[colSellerSKU],
          quantity: Number(row[colQuantity]) || 0,
          orderId: row[colOrderId]
        }))
        .filter((row) => row.sellerSKU && row.orderId)

      // 2. Query products 1 lần
      const productNames = Array.from(new Set(data.map((row) => row.sellerSKU)))
      const productsDocs = await this.productModel
        .find(
          { name: { $in: productNames }, deletedAt: null },
          { name: 1, items: 1 }
        )
        .lean()
      const productMap = new Map(productsDocs.map((prod) => [prod.name, prod]))

      // 3. Tính item quantities + gom order trong 1 vòng lặp
      const itemQuantities: Record<string, number> = {}
      const orderMap: Record<string, { name: string; quantity: number }[]> = {}
      for (const row of data) {
        const product = productMap.get(row.sellerSKU)
        if (!product) continue
        for (const item of product.items) {
          const id = item._id.toString()
          itemQuantities[id] =
            (itemQuantities[id] || 0) + item.quantity * row.quantity
        }
        if (!orderMap[row.orderId]) orderMap[row.orderId] = []
        orderMap[row.orderId].push({
          name: row.sellerSKU,
          quantity: row.quantity
        })
      }

      // 4. Group orders
      const groupedOrders = Object.values(orderMap).reduce(
        (acc, products) => {
          const key = products
            .map((p) => `${p.name}${p.quantity}`)
            .sort()
            .join(",")
          if (!acc[key]) acc[key] = { products, quantity: 0 }
          acc[key].quantity += 1
          return acc
        },
        {} as Record<
          string,
          { products: { name: string; quantity: number }[]; quantity: number }
        >
      )
      const orders = Object.values(groupedOrders)
      const total = orders.reduce((acc, order) => acc + order.quantity, 0)

      // 5. Query storage items directly (simplified from Item -> StorageItem chain)
      const storageItemIds = Object.keys(itemQuantities)
      const storageItemDocs = await this.storageItemModel
        .find({ _id: { $in: storageItemIds } }, { name: 1, code: 1 })
        .lean()

      const storageItemMap = new Map(
        storageItemDocs.map((i) => [i._id.toString(), i])
      )

      // 6. Kết quả cuối với StorageItems trực tiếp
      const resultWithStorageItems = storageItemDocs.map((storageItem) => ({
        _id: storageItem._id.toString(),
        name: storageItem.name,
        quantity: itemQuantities[storageItem._id.toString()] || 0,
        storageItems: [storageItem] // Direct storage item reference
      }))

      return { items: resultWithStorageItems, orders, total }
    } catch (error) {
      console.error("Error in calFromXlsx:", error)
      throw new HttpException(
        "Có lỗi khi tính toán từ file Excel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Soft delete: set deletedAt to now
  async deleteProduct(id: string): Promise<void> {
    try {
      const res = await this.productModel.findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true }
      )
      if (!res) {
        throw new HttpException(
          "Không tìm thấy sản phẩm hoặc sản phẩm đã bị xóa",
          HttpStatus.NOT_FOUND
        )
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Restore product: set deletedAt to null
  async restoreProduct(id: string): Promise<void> {
    try {
      const res = await this.productModel.findOneAndUpdate(
        { _id: id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { new: true }
      )
      if (!res) {
        throw new HttpException(
          "Không tìm thấy sản phẩm đã bị xóa",
          HttpStatus.NOT_FOUND
        )
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi phục hồi sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
