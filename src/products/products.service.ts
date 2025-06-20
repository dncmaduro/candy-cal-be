import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { CalItemsResponse, XlsxData } from "./products"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Product } from "../database/mongoose/schemas/Product"
import { CalXlsxDto, ProductDto } from "./dto/product.dto"
import * as XLSX from "xlsx"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { Item } from "../database/mongoose/schemas/Item"

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel("products")
    private readonly productModel: Model<Product>,
    @InjectModel("items")
    private readonly itemModel: Model<Item>,
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>
  ) {}

  async createProduct(product: ProductDto): Promise<Product> {
    try {
      const newProduct = new this.productModel(product)
      return await newProduct.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateProduct(product: Product): Promise<Product> {
    try {
      const updatedProduct = await this.productModel.findByIdAndUpdate(
        product._id,
        product,
        { new: true }
      )

      if (!updatedProduct) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }

      return updatedProduct
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
  ): Promise<Product> {
    try {
      const updatedProduct = await this.productModel.findByIdAndUpdate(
        productId,
        { items },
        { new: true }
      )

      if (!updatedProduct) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }

      return updatedProduct
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllProducts(): Promise<Product[]> {
    try {
      return await this.productModel.find().exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy danh sách sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getProduct(id: string): Promise<Product> {
    try {
      const product = await this.productModel.findById(id).exec()

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

  async searchProducts(searchText: string): Promise<Product[]> {
    try {
      const products = await this.productModel
        .find({
          name: { $regex: `.*${searchText}.*`, $options: "i" }
        })
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

  async changeReadyStatus(productId: string): Promise<Product> {
    try {
      const product = await this.productModel.findById(productId).exec()
      if (!product) {
        throw new HttpException("Không tìm thấy sản phẩm", HttpStatus.NOT_FOUND)
      }
      product.isReady = !product.isReady
      await product.save()
      return product
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
      // Đọc excel
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxData[]
      const productNames = Array.from(
        new Set(data.map((row) => row["Seller SKU"]))
      )
      // Map name -> product
      const productsDocs = await this.productModel
        .find({ name: { $in: productNames } })
        .lean()
      const productMap = new Map(productsDocs.map((prod) => [prod.name, prod]))

      // 1. Tính quantity cho từng item (key: itemId, value: quantity)
      const itemQuantities: Record<string, number> = {}

      for (const row of data as any[]) {
        const product = productMap.get(row["Seller SKU"])
        if (product) {
          for (const item of product.items) {
            if (!itemQuantities[item._id.toString()]) {
              itemQuantities[item._id.toString()] = 0
            }
            itemQuantities[item._id.toString()] += item.quantity * row.Quantity
          }
        }
      }

      // 2. Orders group logic giữ nguyên
      const convertedOrders = data.reduce(
        (acc, row) => {
          if (acc[row["Order ID"]]) {
            acc[row["Order ID"]].push({
              name: row["Seller SKU"],
              quantity: row["Quantity"],
              isReady: productMap.get(row["Seller SKU"])?.isReady ?? false
            })
          } else {
            acc[row["Order ID"]] = [
              {
                name: row["Seller SKU"],
                quantity: row["Quantity"],
                isReady: productMap.get(row["Seller SKU"])?.isReady ?? false
              }
            ]
          }
          return acc
        },
        {} as Record<
          string,
          {
            name: string
            quantity: number
            isReady: boolean
          }[]
        >
      )

      const groupedOrders = Object.values(convertedOrders).reduce(
        (acc, products) => {
          const key = products
            .map((product) => `${product.name}${product.quantity}`)
            .sort()
            .join(",")
          if (!acc[key]) {
            acc[key] = { products, quantity: 0 }
          }
          acc[key].quantity += 1
          return acc
        },
        {} as Record<
          string,
          {
            products: {
              name: string
              quantity: number
              isReady: boolean
            }[]
            quantity: number
          }
        >
      )

      const orders = Object.values(groupedOrders)
      orders.shift()
      const total = orders.reduce((acc, order) => acc + order.quantity, 0)

      // 3. Lấy chi tiết các item và storage item liên quan
      const itemIds = Object.keys(itemQuantities)
      const itemDocs = await this.itemModel
        .find({ _id: { $in: itemIds } })
        .lean()

      // Lấy toàn bộ storage item liên quan đến các variants
      const allVariantIds = itemDocs.flatMap((item) => item.variants)
      const uniqueVariantIds = Array.from(
        new Set(allVariantIds.map((id) => id.toString()))
      )
      const storageItems = await this.storageItemModel
        .find({ _id: { $in: uniqueVariantIds } })
        .lean()

      // Map storageItemId -> storageItem
      const storageItemMap = new Map(
        storageItems.map((item) => [item._id.toString(), item])
      )

      // Map lại kết quả cho đúng yêu cầu
      const resultWithStorageItems = itemDocs.map((itemDoc) => ({
        _id: itemDoc._id.toString(),
        name: itemDoc.name,
        quantity: itemQuantities[itemDoc._id.toString()] || 0,
        storageItems: (itemDoc.variants || [])
          .map((variantId) => storageItemMap.get(variantId.toString()))
          .filter(Boolean)
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
}
