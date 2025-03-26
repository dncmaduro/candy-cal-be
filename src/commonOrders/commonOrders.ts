import { CommonOrder } from "src/database/mongoose/schemas/CommonOrder"
import { CommonOrderDto } from "./dto/commonOrder.dto"

export interface ICommonOrdersService {
  createOrder(commonOrder: CommonOrderDto): Promise<CommonOrder>
  updateOrder(commonOrder: CommonOrder): Promise<CommonOrder>
  getAllOrders(): Promise<CommonOrder[]>
  getOrder(id: string): Promise<CommonOrder>
  searchOrders(searchText: string): Promise<CommonOrder[]>
}
