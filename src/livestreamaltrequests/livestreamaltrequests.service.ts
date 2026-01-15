import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamAltRequest } from "../database/mongoose/schemas/LivestreamAltRequest"
import { Livestream } from "../database/mongoose/schemas/Livestream"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class LivestreamaltrequestsService {
  constructor(
    @InjectModel("livestreamaltrequest")
    private readonly livestreamAltRequestModel: Model<LivestreamAltRequest>,
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  // helper: validate user exists
  private async validateUserExists(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec()
    if (!user) {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND)
    }
  }

  // Search alt requests
  async searchAltRequests(
    page = 1,
    limit = 10,
    status?: "pending" | "accepted" | "rejected",
    channel?: string,
    requestBy?: string,
    userId?: string,
    userRoles?: string[]
  ): Promise<{ data: LivestreamAltRequest[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const filter: any = {}

      // Check if user is admin or leader
      const isAdminOrLeader =
        userRoles?.includes("admin") || userRoles?.includes("livestream-leader")

      // Filter by status
      if (status) {
        filter.status = status
      }

      // Filter by requestBy (createdBy)
      if (requestBy) {
        filter.createdBy = requestBy
      }

      // Get requests matching initial filters
      let query = this.livestreamAltRequestModel
        .find(filter)
        .populate("createdBy", "_id name username avatarUrl")

      const requests = await query.exec()

      // Filter by channel if provided (need to check livestream snapshots)
      let filteredRequests = requests
      if (channel || (!isAdminOrLeader && userId)) {
        const filteredByChannelAndUser = []
        for (const request of requests) {
          const livestream = await this.livestreamModel
            .findById(request.livestreamId)
            .exec()
          if (livestream) {
            const snapshot = livestream.snapshots.find(
              (s: any) => s._id?.toString() === request.snapshotId.toString()
            )
            if (snapshot) {
              // Check channel filter
              const channelMatch = channel
                ? (snapshot as any).period?.channel === channel
                : true

              // Check user filter (only if not admin/leader)
              let userMatch = true
              if (!isAdminOrLeader && userId) {
                const assigneeId = (snapshot as any).assignee?.toString()
                const altAssigneeId =
                  (snapshot as any).altAssignee === "other"
                    ? null
                    : (snapshot as any).altAssignee?.toString()
                userMatch = assigneeId === userId || altAssigneeId === userId
              }

              if (channelMatch && userMatch) {
                filteredByChannelAndUser.push(request)
              }
            }
          }
        }
        filteredRequests = filteredByChannelAndUser
      }

      // Apply pagination
      const total = filteredRequests.length
      const paginatedData = filteredRequests.slice(
        (safePage - 1) * safeLimit,
        safePage * safeLimit
      )

      return { data: paginatedData, total }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Create alt request
  async createAltRequest(payload: {
    livestreamId: string
    snapshotId: string
    altNote: string
    createdBy: string
  }): Promise<LivestreamAltRequest> {
    console.log("creatae")
    try {
      // Validate user exists
      await this.validateUserExists(payload.createdBy)

      // Validate livestream exists
      const livestream = await this.livestreamModel
        .findById(payload.livestreamId)
        .exec()
      if (!livestream) {
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)
      }

      // Validate snapshot exists in livestream
      const snapshot = livestream.snapshots.find(
        (s: any) => s._id?.toString() === payload.snapshotId
      )
      if (!snapshot) {
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)
      }

      // Check if there's already a pending request for this snapshot
      const existingRequest = await this.livestreamAltRequestModel
        .findOne({
          livestreamId: payload.livestreamId,
          snapshotId: payload.snapshotId,
          status: "pending"
        })
        .exec()

      if (existingRequest) {
        throw new HttpException(
          "A pending request already exists for this snapshot",
          HttpStatus.BAD_REQUEST
        )
      }

      const created = new this.livestreamAltRequestModel({
        createdBy: new Types.ObjectId(payload.createdBy),
        livestreamId: new Types.ObjectId(payload.livestreamId),
        snapshotId: new Types.ObjectId(payload.snapshotId),
        altNote: payload.altNote,
        status: "pending"
      })

      const saved = await created.save()
      await saved.populate("createdBy", "_id name username avatarUrl")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Update alt request (only creator can update)
  async updateAltRequest(
    requestId: string,
    userId: string,
    payload: {
      altNote: string
    }
  ): Promise<LivestreamAltRequest> {
    try {
      const request = await this.livestreamAltRequestModel
        .findById(requestId)
        .exec()
      if (!request) {
        throw new HttpException("Request not found", HttpStatus.NOT_FOUND)
      }

      // Check if user is the creator
      if (request.createdBy.toString() !== userId) {
        throw new HttpException(
          "Only the creator can update this request",
          HttpStatus.FORBIDDEN
        )
      }

      // Only allow update if status is pending
      if (request.status !== "pending") {
        throw new HttpException(
          "Cannot update request that is not pending",
          HttpStatus.BAD_REQUEST
        )
      }

      request.altNote = payload.altNote
      request.updatedAt = new Date()

      const saved = await request.save()
      await saved.populate("createdBy", "_id name username avatarUrl")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Get request by livestream id and snapshot id
  async getRequestBySnapshot(
    livestreamId: string,
    snapshotId: string,
    userId: string
  ): Promise<LivestreamAltRequest | null> {
    try {
      const request = await this.livestreamAltRequestModel
        .findOne({
          livestreamId: livestreamId,
          snapshotId: snapshotId
        })
        .populate("createdBy", "_id name username avatarUrl")
        .exec()

      if (!request) {
        return null
      }

      // Get user roles from database
      const user = await this.userModel.findById(userId).exec()
      if (!user) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      // Check permissions: creator, livestream-leader, or admin
      const isCreator = request.createdBy._id.toString() === userId
      const isLeaderOrAdmin =
        user.roles.includes("admin") ||
        user.roles.includes("livestream-leader") ||
        user.roles.includes("livestream-accounting")

      if (!isCreator && !isLeaderOrAdmin) {
        throw new HttpException(
          "You don't have permission to view this request",
          HttpStatus.FORBIDDEN
        )
      }

      return request
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Update request status (only leader/admin can update)
  async updateRequestStatus(
    requestId: string,
    payload: {
      status: "accepted" | "rejected"
      altAssignee?: string
    }
  ): Promise<LivestreamAltRequest> {
    try {
      const request = await this.livestreamAltRequestModel
        .findById(requestId)
        .exec()
      if (!request) {
        throw new HttpException("Request not found", HttpStatus.NOT_FOUND)
      }

      // Only allow update if current status is pending
      if (request.status !== "pending") {
        throw new HttpException(
          "Cannot update request that is not pending",
          HttpStatus.BAD_REQUEST
        )
      }

      // If accepting, altAssignee is required
      if (payload.status === "accepted") {
        if (!payload.altAssignee) {
          throw new HttpException(
            "altAssignee is required when accepting request",
            HttpStatus.BAD_REQUEST
          )
        }

        // Validate altAssignee exists
        await this.validateUserExists(payload.altAssignee)

        // Update the snapshot with altAssignee and altNote
        const livestream = await this.livestreamModel
          .findById(request.livestreamId)
          .exec()
        if (!livestream) {
          throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)
        }

        const snapshot = livestream.snapshots.find(
          (s: any) => s._id?.toString() === request.snapshotId.toString()
        )
        if (!snapshot) {
          throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)
        }

        // Check that altAssignee is different from assignee
        const assigneeId = (snapshot as any).assignee?.toString()
        if (assigneeId === payload.altAssignee) {
          throw new HttpException(
            "altAssignee must be different from assignee",
            HttpStatus.BAD_REQUEST
          )
        }

        // Update snapshot with alt info
        ;(snapshot as any).altAssignee = new Types.ObjectId(payload.altAssignee)
        ;(snapshot as any).altNote = request.altNote

        await livestream.save()
      }

      // Update request status
      request.status = payload.status
      request.updatedAt = new Date()

      const saved = await request.save()
      await saved.populate("createdBy", "_id name username avatarUrl")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Delete request (only creator can delete, only if pending)
  async deleteAltRequest(requestId: string, userId: string): Promise<void> {
    try {
      const request = await this.livestreamAltRequestModel
        .findById(requestId)
        .exec()
      if (!request) {
        throw new HttpException("Request not found", HttpStatus.NOT_FOUND)
      }

      // Check if user is the creator
      if (request.createdBy.toString() !== userId) {
        throw new HttpException(
          "Only the creator can delete this request",
          HttpStatus.FORBIDDEN
        )
      }

      // Only allow delete if status is pending
      if (request.status !== "pending") {
        throw new HttpException(
          "Cannot delete request that is not pending",
          HttpStatus.BAD_REQUEST
        )
      }

      await this.livestreamAltRequestModel.findByIdAndDelete(requestId).exec()
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
