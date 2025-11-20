import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { SalesTask } from "../database/mongoose/schemas/SalesTask"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class SalesTasksService {
  constructor(
    @InjectModel("salestasks")
    private readonly salesTaskModel: Model<SalesTask>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>,
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  async createTask(payload: {
    salesFunnelId: string
    type: "call" | "message" | "other"
    activityId?: string
    deadline: Date
    note?: string
  }): Promise<SalesTask> {
    try {
      // Validate funnel exists and get assignee from funnel
      const funnel = await this.salesFunnelModel.findById(payload.salesFunnelId)
      if (!funnel) {
        throw new HttpException("Sales funnel not found", HttpStatus.NOT_FOUND)
      }

      // Get assignee from funnel's user field
      const assigneeId = funnel.user

      // Validate assignee exists and has sales-emp role
      const assignee = await this.userModel.findById(assigneeId)
      if (!assignee) {
        throw new HttpException(
          "Nhân viên phụ trách funnel không tồn tại",
          HttpStatus.NOT_FOUND
        )
      }
      if (!assignee.roles || !assignee.roles.includes("sales-emp")) {
        throw new HttpException(
          "Nhân viên phụ trách funnel không có quyền sales-emp",
          HttpStatus.BAD_REQUEST
        )
      }

      const task = await this.salesTaskModel.create({
        salesFunnelId: new Types.ObjectId(payload.salesFunnelId),
        type: payload.type,
        assigneeId: new Types.ObjectId(assigneeId.toString()),
        activityId: payload.activityId
          ? new Types.ObjectId(payload.activityId)
          : undefined,
        deadline: payload.deadline,
        note: payload.note,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return task
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in createTask:", error)
      throw new HttpException(
        "Có lỗi khi tạo task",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllTasks(
    page: number = 1,
    limit: number = 20,
    assigneeId?: string,
    salesFunnelId?: string,
    completed?: boolean
  ): Promise<{ data: SalesTask[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const filter: any = {}

      if (assigneeId) {
        filter.assigneeId = new Types.ObjectId(assigneeId)
      }

      if (salesFunnelId) {
        filter.salesFunnelId = new Types.ObjectId(salesFunnelId)
      }

      if (completed !== undefined) {
        filter.completed = completed
      }

      const [data, total] = await Promise.all([
        this.salesTaskModel
          .find(filter)
          .populate("salesFunnelId", "name phoneNumber")
          .populate("assigneeId", "name username")
          .populate("activityId", "time type note")
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 }),
        this.salesTaskModel.countDocuments(filter)
      ])

      return { data, total }
    } catch (error) {
      console.error("Error in getAllTasks:", error)
      throw new HttpException(
        "Có lỗi khi lấy danh sách task",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getTaskById(id: string): Promise<SalesTask> {
    try {
      const task = await this.salesTaskModel
        .findById(id)
        .populate("salesFunnelId", "name phoneNumber")
        .populate("assigneeId", "name username")
        .populate("activityId", "time type note")

      if (!task) {
        throw new HttpException("Task không tồn tại", HttpStatus.NOT_FOUND)
      }

      return task
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getTaskById:", error)
      throw new HttpException(
        "Có lỗi khi lấy thông tin task",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateTask(
    id: string,
    payload: {
      type?: "call" | "message" | "other"
      assigneeId?: string
      activityId?: string
      deadline?: Date
      note?: string
    }
  ): Promise<SalesTask> {
    try {
      const task = await this.salesTaskModel.findById(id)

      if (!task) {
        throw new HttpException("Task không tồn tại", HttpStatus.NOT_FOUND)
      }

      // If updating assignee, validate they exist and have sales-emp role
      if (payload.assigneeId) {
        const assignee = await this.userModel.findById(payload.assigneeId)
        if (!assignee) {
          throw new HttpException("Assignee not found", HttpStatus.NOT_FOUND)
        }
        if (!assignee.roles || !assignee.roles.includes("sales-emp")) {
          throw new HttpException(
            "Assignee must have sales-emp role",
            HttpStatus.BAD_REQUEST
          )
        }
        task.assigneeId = new Types.ObjectId(payload.assigneeId)
      }

      if (payload.type !== undefined) task.type = payload.type
      if (payload.activityId !== undefined)
        task.activityId = payload.activityId
          ? new Types.ObjectId(payload.activityId)
          : undefined
      if (payload.deadline !== undefined) task.deadline = payload.deadline
      if (payload.note !== undefined) task.note = payload.note
      task.updatedAt = new Date()

      return await task.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in updateTask:", error)
      throw new HttpException(
        "Có lỗi khi cập nhật task",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      const task = await this.salesTaskModel.findById(id)

      if (!task) {
        throw new HttpException("Task không tồn tại", HttpStatus.NOT_FOUND)
      }

      await this.salesTaskModel.findByIdAndDelete(id)
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in deleteTask:", error)
      throw new HttpException(
        "Có lỗi khi xóa task",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async completeTask(id: string): Promise<SalesTask> {
    try {
      const task = await this.salesTaskModel.findById(id)

      if (!task) {
        throw new HttpException("Task không tồn tại", HttpStatus.NOT_FOUND)
      }

      if (task.completed) {
        throw new HttpException(
          "Task đã được hoàn thành trước đó",
          HttpStatus.BAD_REQUEST
        )
      }

      task.completed = true
      task.completedAt = new Date()
      task.updatedAt = new Date()

      return await task.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in completeTask:", error)
      throw new HttpException(
        "Có lỗi khi hoàn thành task",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
