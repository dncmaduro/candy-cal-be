import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { ICombosService } from "./combos"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Combo } from "src/database/mongoose/schemas/Combo"
import { ComboDto } from "./dto/combo.dto"

@Injectable()
export class CombosService implements ICombosService {
  constructor(
    @InjectModel("combos")
    private readonly comboModel: Model<Combo>
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
}
