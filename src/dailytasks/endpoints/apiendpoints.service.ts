import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { ApiEndpoint } from "../../database/mongoose/schemas/ApiEndpoint"

@Injectable()
export class ApiEndpointsService {
  constructor(
    @InjectModel("ApiEndpoint")
    private readonly apiEndpointModel: Model<ApiEndpoint>
  ) {}

  async list(): Promise<ApiEndpoint[]> {
    return this.apiEndpointModel
      .find({ deleted: false })
      .sort({ key: 1 })
      .lean()
  }

  async options(): Promise<Array<{ value: string; label: string }>> {
    const list = await this.list()
    return list
      .filter((e) => e.active)
      .map((e) => ({ value: e.key, label: e.name }))
  }

  async create(payload: {
    key: string
    name: string
    method: string
    url: string
    headers?: Record<string, string>
    description?: string
  }): Promise<ApiEndpoint> {
    const existed = await this.apiEndpointModel.findOne({ key: payload.key })
    if (existed) throw new HttpException("Key đã tồn tại", HttpStatus.CONFLICT)
    const doc = await this.apiEndpointModel.create(payload)
    return doc.toObject() as any
  }

  async update(
    key: string,
    payload: Partial<{
      name: string
      method: string
      url: string
      headers: Record<string, string>
      description: string
      active: boolean
    }>
  ): Promise<ApiEndpoint> {
    const doc = await this.apiEndpointModel.findOne({ key, deleted: false })
    if (!doc) throw new HttpException("Không tìm thấy", HttpStatus.NOT_FOUND)
    if (payload.name !== undefined) doc.name = payload.name
    if (payload.method !== undefined) doc.method = payload.method as any
    if (payload.url !== undefined) doc.url = payload.url
    if (payload.headers !== undefined) doc.headers = payload.headers
    if (payload.description !== undefined) doc.description = payload.description
    if (payload.active !== undefined) doc.active = payload.active
    await doc.save()
    return doc.toObject() as any
  }

  async softDelete(key: string): Promise<{ deleted: boolean }> {
    const doc = await this.apiEndpointModel.findOne({ key, deleted: false })
    if (!doc) return { deleted: false }
    doc.deleted = true
    await doc.save()
    return { deleted: true }
  }

  async getActiveByKey(key: string): Promise<ApiEndpoint | null> {
    return this.apiEndpointModel
      .findOne({ key, active: true, deleted: false })
      .lean()
  }
}
