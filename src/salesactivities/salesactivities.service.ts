import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { SalesActivity } from "../database/mongoose/schemas/SalesActivity"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import { SalesTask } from "../database/mongoose/schemas/SalesTask"

@Injectable()
export class SalesActivitiesService {
  constructor(
    @InjectModel("salesactivities")
    private readonly salesActivityModel: Model<SalesActivity>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>,
    @InjectModel("salestasks")
    private readonly salesTaskModel: Model<SalesTask>
  ) {}

  async createActivity(
    payload: {
      time: Date
      type: "call" | "message" | "other"
      note?: string
      salesFunnelId: string
    },
    userId?: string
  ): Promise<SalesActivity> {
    try {
      // Validate funnel exists
      const funnel = await this.salesFunnelModel.findById(payload.salesFunnelId)
      if (!funnel) {
        throw new HttpException("Sales funnel not found", HttpStatus.NOT_FOUND)
      }

      const activity = await this.salesActivityModel.create({
        time: payload.time,
        type: payload.type,
        note: payload.note,
        salesFunnelId: new Types.ObjectId(payload.salesFunnelId),
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // Auto-complete matching tasks
      if (userId) {
        await this.autoCompleteMatchingTasks(
          payload.salesFunnelId,
          userId,
          activity._id.toString()
        )
      }

      return activity
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in createActivity:", error)
      throw new HttpException(
        "Có lỗi khi tạo hoạt động",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllActivities(
    page: number = 1,
    limit: number = 20,
    salesFunnelId?: string,
    type?: "call" | "message" | "other"
  ): Promise<{ data: SalesActivity[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const filter: any = {}

      if (salesFunnelId) {
        filter.salesFunnelId = new Types.ObjectId(salesFunnelId)
      }

      if (type) {
        filter.type = type
      }

      const [data, total] = await Promise.all([
        this.salesActivityModel
          .find(filter)
          .populate("salesFunnelId", "name phoneNumber")
          .skip(skip)
          .limit(limit)
          .sort({ time: -1 }),
        this.salesActivityModel.countDocuments(filter)
      ])

      return { data, total }
    } catch (error) {
      console.error("Error in getAllActivities:", error)
      throw new HttpException(
        "Có lỗi khi lấy danh sách hoạt động",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getActivityById(id: string): Promise<SalesActivity> {
    try {
      const activity = await this.salesActivityModel
        .findById(id)
        .populate("salesFunnelId", "name phoneNumber")

      if (!activity) {
        throw new HttpException("Hoạt động không tồn tại", HttpStatus.NOT_FOUND)
      }

      return activity
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getActivityById:", error)
      throw new HttpException(
        "Có lỗi khi lấy thông tin hoạt động",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateActivity(
    id: string,
    payload: {
      time?: Date
      type?: "call" | "message" | "other"
      note?: string
    },
    userId?: string
  ): Promise<SalesActivity> {
    try {
      const activity = await this.salesActivityModel.findById(id)

      if (!activity) {
        throw new HttpException("Hoạt động không tồn tại", HttpStatus.NOT_FOUND)
      }

      if (payload.time !== undefined) activity.time = payload.time
      if (payload.type !== undefined) activity.type = payload.type
      if (payload.note !== undefined) activity.note = payload.note
      activity.updatedAt = new Date()

      const updated = await activity.save()

      // Auto-complete matching tasks
      if (userId) {
        await this.autoCompleteMatchingTasks(
          activity.salesFunnelId.toString(),
          userId,
          activity._id.toString()
        )
      }

      return updated
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in updateActivity:", error)
      throw new HttpException(
        "Có lỗi khi cập nhật hoạt động",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteActivity(id: string): Promise<void> {
    try {
      const activity = await this.salesActivityModel.findById(id)

      if (!activity) {
        throw new HttpException("Hoạt động không tồn tại", HttpStatus.NOT_FOUND)
      }

      await this.salesActivityModel.findByIdAndDelete(id)
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in deleteActivity:", error)
      throw new HttpException(
        "Có lỗi khi xóa hoạt động",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getLatestActivitiesByFunnel(
    salesFunnelId: string,
    limit: number = 5
  ): Promise<SalesActivity[]> {
    try {
      // Validate funnel exists
      const funnel = await this.salesFunnelModel.findById(salesFunnelId)
      if (!funnel) {
        throw new HttpException("Sales funnel not found", HttpStatus.NOT_FOUND)
      }

      const activities = await this.salesActivityModel
        .find({ salesFunnelId: new Types.ObjectId(salesFunnelId) })
        .sort({ time: -1 })
        .limit(limit)
        .lean()

      return activities
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getLatestActivitiesByFunnel:", error)
      throw new HttpException(
        "Có lỗi khi lấy hoạt động gần nhất",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private async autoCompleteMatchingTasks(
    salesFunnelId: string,
    userId: string,
    activityId: string
  ): Promise<void> {
    try {
      // Find uncompleted tasks with matching funnel and assignee
      const matchingTasks = await this.salesTaskModel.find({
        salesFunnelId: new Types.ObjectId(salesFunnelId),
        assigneeId: new Types.ObjectId(userId),
        completed: false
      })

      // Update all matching tasks
      if (matchingTasks.length > 0) {
        await this.salesTaskModel.updateMany(
          {
            salesFunnelId: new Types.ObjectId(salesFunnelId),
            assigneeId: new Types.ObjectId(userId),
            completed: false
          },
          {
            $set: {
              completed: true,
              completedAt: new Date(),
              activityId: new Types.ObjectId(activityId),
              updatedAt: new Date()
            }
          }
        )
      }
    } catch (error) {
      // Log error but don't throw - this is a secondary operation
      console.error("Error in autoCompleteMatchingTasks:", error)
    }
  }
}
