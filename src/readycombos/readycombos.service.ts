import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { ReadyCombo } from "../database/mongoose/schemas/ReadyCombo"
import { ReadyComboDto } from "./dto/readycombos.dto"

@Injectable()
export class ReadyCombosService {
  constructor(
    @InjectModel("readycombos")
    private readonly readyComboModel: Model<ReadyCombo>
  ) {}

  async createCombo(combo: ReadyComboDto): Promise<ReadyCombo> {
    const newCombo = new this.readyComboModel(combo)
    return await newCombo.save()
  }

  async updateCombo(
    comboId: string,
    combo: ReadyComboDto
  ): Promise<ReadyCombo> {
    try {
      const updatedCombo = await this.readyComboModel.findByIdAndUpdate(
        comboId,
        combo,
        { new: true }
      )
      return updatedCombo
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async toggleReadyCombo(comboId: string): Promise<ReadyCombo> {
    try {
      const combo = await this.readyComboModel.findById(comboId)
      combo.isReady = !combo.isReady
      return await combo.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchCombos(
    searchText?: string,
    isReady?: boolean
  ): Promise<ReadyCombo[]> {
    try {
      const query: any = {}
      if (searchText) {
        query.name = { $regex: searchText, $options: "i" }
      }
      if (isReady !== undefined) {
        query.isReady = isReady
      }
      return await this.readyComboModel.find(query).exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteCombo(comboId: string): Promise<void> {
    try {
      const result = await this.readyComboModel.findByIdAndDelete(comboId)
      if (!result) {
        throw new HttpException("Combo not found", HttpStatus.NOT_FOUND)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
