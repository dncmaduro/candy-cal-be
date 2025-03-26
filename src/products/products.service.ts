import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { CalItemsResponse, IProductsService, XlsxData } from "./products"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Product } from "src/database/mongoose/schemas/Product"
import { CalProductsDto, CalXlsxDto, ProductDto } from "./dto/product.dto"
import * as XLSX from "xlsx"

@Injectable()
export class ProductsService implements IProductsService {
  constructor(
    @InjectModel("products")
    private readonly productModel: Model<Product>
  ) {}

  async createProduct(product: ProductDto): Promise<Product> {
    try {
      const newProduct = new this.productModel(product)
      return await newProduct.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
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
        throw new HttpException("Product not found", HttpStatus.NOT_FOUND)
      }

      return updatedProduct
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
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
        throw new HttpException("Product not found", HttpStatus.NOT_FOUND)
      }

      return updatedProduct
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
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
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getProduct(id: string): Promise<Product> {
    try {
      const product = await this.productModel.findById(id).exec()

      if (!product) {
        throw new HttpException("Product not found", HttpStatus.NOT_FOUND)
      }

      return product
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
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
        "Internal server error",
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

  async calFromXlsx(dto: CalXlsxDto): Promise<CalItemsResponse> {
    try {
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxData[]
      // const data = tempData.slice(0, tempData.length - 1)

      const itemQuantities: Record<string, number> = {}

      for (const row of data as any[]) {
        const product = await this.productModel
          .findOne({
            name: row["Seller SKU"]
          })
          .exec()
        if (product) {
          for (const item of product.items) {
            if (!itemQuantities[item._id.toString()]) {
              itemQuantities[item._id.toString()] = 0
            }
            itemQuantities[item._id.toString()] += item.quantity * row.Quantity
          }
        }
      }

      const convertedOrders = data.reduce(
        (acc, row) => {
          if (acc[row["Order ID"]]) {
            acc[row["Order ID"]].push({
              name: row["Seller SKU"],
              quantity: row["Quantity"]
            })
          } else {
            acc[row["Order ID"]] = [
              {
                name: row["Seller SKU"],
                quantity: row["Quantity"]
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
            }[]
            quantity: number
          }
        >
      )

      const orders = Object.values(groupedOrders)
      orders.shift()

      const result = Object.entries(itemQuantities).map(
        ([itemId, quantity]) => ({
          _id: itemId,
          quantity
        })
      )
      return { items: result, orders }
    } catch (error) {
      console.error("Error in calFromXlsx:", error)
      throw new HttpException(
        "Failed to process XLSX file",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
