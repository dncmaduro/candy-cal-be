import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { PackingRule } from "../database/mongoose/schemas/PackingRule"
import { PackingRuleDto } from "./dto/packingrules.dto"

@Injectable()
export class PackingRulesService {
  constructor(
    @InjectModel("packingrules")
    private readonly packingRuleModel: Model<PackingRule>
  ) {}

  async createRule(dto: PackingRuleDto): Promise<PackingRule> {
    try {
      const rule = new this.packingRuleModel(dto)
      return await rule.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo quy tắc đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateRule(
    productCode: string,
    dto: Omit<PackingRuleDto, "productCode">
  ): Promise<PackingRule> {
    try {
      const updated = await this.packingRuleModel.findOneAndUpdate(
        { productCode },
        dto,
        { new: true }
      )
      if (!updated) {
        throw new HttpException("Rule not found", HttpStatus.NOT_FOUND)
      }
      return updated
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật quy tắc đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getRuleByProductCode(productCode: string): Promise<PackingRule | null> {
    try {
      return await this.packingRuleModel.findOne({ productCode }).lean()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy quy tắc đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchRules(
    searchText: string,
    packingType?: string
  ): Promise<{ rules: PackingRule[] }> {
    try {
      const filter: any = {}

      if (searchText) {
        filter.productCode = { $regex: `.*${searchText}.*`, $options: "i" }
      }

      if (packingType) {
        filter["requirements.packingType"] = packingType
      }

      const rules = await this.packingRuleModel.find(filter).lean()

      return { rules }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm kiếm quy tắc đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteRule(productCode: string): Promise<void> {
    try {
      const res = await this.packingRuleModel.findOneAndDelete({ productCode })
      if (!res) {
        throw new HttpException("Rule not found", HttpStatus.NOT_FOUND)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa quy tắc đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getPackingType(
    productCode: string,
    quantity: number
  ): Promise<string | null> {
    try {
      const rule = await this.packingRuleModel.findOne({ productCode }).lean()
      if (!rule || !rule.requirements) return null

      const found = rule.requirements.find(
        (r) =>
          (r.minQuantity === null || quantity >= r.minQuantity) &&
          (r.maxQuantity === null || quantity <= r.maxQuantity)
      )

      return found ? found.packingType : null
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy loại đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
