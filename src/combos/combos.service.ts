import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { CalItemsResponse, ICombosService } from "./combos"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Combo } from "src/database/mongoose/schemas/Combo"
import { CalComboDto, ComboDto } from "./dto/combo.dto"
import { Product } from "src/database/mongoose/schemas/Product"

@Injectable()
export class CombosService implements ICombosService {
  constructor(
    @InjectModel("combos")
    private readonly comboModel: Model<Combo>,

    @InjectModel("products")
    private readonly productModel: Model<Product>
  ) {}

  async createCombo(combo: ComboDto): Promise<Combo> {
    try {
      const newCombo = new this.comboModel(combo)
      return await newCombo.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateCombo(combo: Combo): Promise<Combo> {
    try {
      const updatedCombo = await this.comboModel.findByIdAndUpdate(
        combo._id,
        combo,
        { new: true }
      )

      if (!updatedCombo) {
        throw new HttpException("Combo not found", HttpStatus.NOT_FOUND)
      }

      return updatedCombo
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateProductsForCombo(
    comboId: string,
    products: Combo["products"]
  ): Promise<Combo> {
    try {
      const updatedCombo = await this.comboModel.findByIdAndUpdate(
        comboId,
        { products },
        { new: true }
      )

      if (!updatedCombo) {
        throw new HttpException("Combo not found", HttpStatus.NOT_FOUND)
      }

      return updatedCombo
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllCombos(): Promise<Combo[]> {
    try {
      return await this.comboModel.find().exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getCombo(id: string): Promise<Combo> {
    try {
      const combo = await this.comboModel.findById(id).exec()

      if (!combo) {
        throw new HttpException("Combo not found", HttpStatus.NOT_FOUND)
      }

      return combo
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchCombos(searchText: string): Promise<Combo[]> {
    try {
      const combos = await this.comboModel
        .find({
          name: { $regex: `.*${searchText}.*`, $options: "i" }
        })
        .exec()
      return combos
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async calToItems(combos: CalComboDto[]): Promise<CalItemsResponse[]> {
    try {
      const productQuantities: Record<string, number> = {}

      for (const combo of combos) {
        for (const product of combo.products) {
          if (!productQuantities[product._id]) {
            productQuantities[product._id] = 0
          }
          productQuantities[product._id] += product.quantity * combo.quantity
        }
      }

      const itemQuantities: Record<string, number> = {}

      for (const productId in productQuantities) {
        const product = await this.productModel.findById(productId).exec()
        if (product) {
          for (const item of product.items) {
            if (!itemQuantities[item._id.toString()]) {
              itemQuantities[item._id.toString()] = 0
            }
            itemQuantities[item._id.toString()] +=
              item.quantity * productQuantities[productId]
          }
        }
      }

      // Convert to CalItemsResponse[]
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
