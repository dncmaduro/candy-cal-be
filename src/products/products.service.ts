import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { IProductsService } from "./products"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Product } from "src/database/mongoose/schemas/Product"
import { CalProductsDto, ProductDto } from "./dto/product.dto"
import { CalItemsResponse } from "src/combos/combos"

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

  async calToItems(products: CalProductsDto): Promise<CalItemsResponse[]> {
    try {
      const itemQuantities: Record<string, number> = {}

      products.products.forEach(async (p) => {
        const product = await this.productModel.findById(p._id).exec()
        if (product) {
          for (const item of product.items) {
            if (!itemQuantities[item._id.toString()]) {
              itemQuantities[item._id.toString()] = 0
            }
            itemQuantities[item._id.toString()] += item.quantity * p.quantity
          }
        }
      })

      return Object.entries(itemQuantities).map(([itemId, quantity]) => ({
        _id: itemId,
        quantity
      }))
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
