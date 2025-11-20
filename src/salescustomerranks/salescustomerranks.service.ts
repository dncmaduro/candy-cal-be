import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import {
  SalesCustomerRank,
  Rank
} from "../database/mongoose/schemas/SalesCustomerRank"

@Injectable()
export class SalesCustomerRanksService {
  constructor(
    @InjectModel("salescustomerranks")
    private readonly salesCustomerRankModel: Model<SalesCustomerRank>
  ) {}

  async createRank(payload: {
    rank: Rank
    minIncome: number
  }): Promise<SalesCustomerRank> {
    try {
      // Check if rank already exists
      const existing = await this.salesCustomerRankModel.findOne({
        rank: payload.rank
      })
      if (existing) {
        throw new HttpException(
          `Rank "${payload.rank}" đã tồn tại`,
          HttpStatus.BAD_REQUEST
        )
      }

      const rankDoc = await this.salesCustomerRankModel.create({
        rank: payload.rank,
        minIncome: payload.minIncome
      })

      return rankDoc
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in createRank:", error)
      throw new HttpException(
        "Có lỗi khi tạo rank",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllRanks(): Promise<SalesCustomerRank[]> {
    try {
      return await this.salesCustomerRankModel
        .find()
        .sort({ minIncome: -1 })
        .lean()
    } catch (error) {
      console.error("Error in getAllRanks:", error)
      throw new HttpException(
        "Có lỗi khi lấy danh sách rank",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getRankById(id: string): Promise<SalesCustomerRank | null> {
    try {
      const rank = await this.salesCustomerRankModel.findById(id).lean()
      if (!rank) {
        throw new HttpException("Rank không tồn tại", HttpStatus.NOT_FOUND)
      }
      return rank
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getRankById:", error)
      throw new HttpException(
        "Có lỗi khi lấy thông tin rank",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateRank(
    id: string,
    payload: {
      rank?: Rank
      minIncome?: number
    }
  ): Promise<SalesCustomerRank> {
    try {
      const rankDoc = await this.salesCustomerRankModel.findById(id)
      if (!rankDoc) {
        throw new HttpException("Rank không tồn tại", HttpStatus.NOT_FOUND)
      }

      // Check if rank name is being changed and if new rank already exists
      if (payload.rank && payload.rank !== rankDoc.rank) {
        const existing = await this.salesCustomerRankModel.findOne({
          rank: payload.rank
        })
        if (existing) {
          throw new HttpException(
            `Rank "${payload.rank}" đã tồn tại`,
            HttpStatus.BAD_REQUEST
          )
        }
        rankDoc.rank = payload.rank
      }

      if (payload.minIncome !== undefined) {
        rankDoc.minIncome = payload.minIncome
      }

      return await rankDoc.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in updateRank:", error)
      throw new HttpException(
        "Có lỗi khi cập nhật rank",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteRank(id: string): Promise<void> {
    try {
      const rank = await this.salesCustomerRankModel.findById(id)
      if (!rank) {
        throw new HttpException("Rank không tồn tại", HttpStatus.NOT_FOUND)
      }

      await this.salesCustomerRankModel.findByIdAndDelete(id)
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in deleteRank:", error)
      throw new HttpException(
        "Có lỗi khi xóa rank",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
