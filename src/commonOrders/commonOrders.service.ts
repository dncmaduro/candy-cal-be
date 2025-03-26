import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { ICommonOrdersService } from "./commonOrders"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { CommonOrder } from "src/database/mongoose/schemas/CommonOrder"
import { CommonOrderDto } from "./dto/commonOrder.dto"

@Injectable()
export class CommonOrdersService implements ICommonOrdersService {
  constructor(
    @InjectModel("commonorders")
    private readonly commonOrderModel: Model<CommonOrder>
  ) {}

  async createOrder(commonOrder: CommonOrderDto): Promise<CommonOrder> {
    try {
      const newOrder = new this.commonOrderModel(commonOrder)
      return await newOrder.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateOrder(commonOrder: CommonOrder): Promise<CommonOrder> {
    try {
      const updatedOrder = await this.commonOrderModel.findByIdAndUpdate(
        commonOrder._id,
        commonOrder,
        { new: true }
      )

      if (!updatedOrder) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      return updatedOrder
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllOrders(): Promise<CommonOrder[]> {
    try {
      return await this.commonOrderModel.find().exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getOrder(id: string): Promise<CommonOrder> {
    try {
      const commonOrder = await this.commonOrderModel.findById(id).exec()

      if (!commonOrder) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      return commonOrder
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchOrders(searchText: string): Promise<CommonOrder[]> {
    try {
      const orders = await this.commonOrderModel
        .find({
          name: { $regex: `.*${searchText}.*`, $options: "i" }
        })
        .exec()
      return orders
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
