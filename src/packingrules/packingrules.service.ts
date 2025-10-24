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
      const rule = new this.packingRuleModel({
        products: dto.products || [],
        packingType: dto.packingType
      })
      return await rule.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo quy tắc đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateRule(id: string, dto: PackingRuleDto): Promise<PackingRule> {
    try {
      const updated = await this.packingRuleModel.findByIdAndUpdate(
        id,
        {
          $set: {
            products: dto.products || [],
            packingType: dto.packingType
          }
        },
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

  async getRuleById(id: string): Promise<PackingRule | null> {
    try {
      return await this.packingRuleModel.findById(id).lean()
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
        filter["products.productCode"] = {
          $regex: `.*${searchText}.*`,
          $options: "i"
        }
      }

      if (packingType) {
        filter.packingType = packingType
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

  async deleteRule(id: string): Promise<void> {
    try {
      const res = await this.packingRuleModel.findByIdAndDelete(id)
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
    products: {
      productCode: string
      quantity: number
    }[]
  ): Promise<string | null> {
    try {
      // Get all unique product codes
      const productCodes = [...new Set(products.map((p) => p.productCode))]

      // Find a rule that contains all these product codes
      const rule = await this.packingRuleModel
        .findOne({
          "products.productCode": { $all: productCodes }
        })
        .lean()

      if (!rule || !rule.products) return null

      // For each product in the order, check if it matches the rule's quantity requirements
      for (const orderProduct of products) {
        const ruleProduct = rule.products.find(
          (p: any) => p.productCode === orderProduct.productCode
        )

        if (!ruleProduct) return null

        // Check if quantity is within range
        const minQty = ruleProduct.minQuantity
        const maxQty = ruleProduct.maxQuantity

        if (minQty !== null && orderProduct.quantity < minQty) return null
        if (maxQty !== null && orderProduct.quantity > maxQty) return null
      }

      // If all products match, return the rule's packing type
      return rule.packingType
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy loại đóng gói",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
