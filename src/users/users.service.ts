import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { User } from "../database/mongoose/schemas/User"
import { Permission } from "../database/mongoose/schemas/Permission"
import { PermissionGroup } from "../database/mongoose/schemas/PermissionGroup"
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  UpdateUserDto,
  ValidTokenDto
} from "./dto/login.dto"
import { JwtService } from "@nestjs/jwt"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Injectable()
export class UsersService {
  constructor(
    @InjectModel("users")
    private readonly userModel: Model<User>,
    @InjectModel("permissions")
    private readonly permissionModel: Model<Permission>,
    @InjectModel("permissiongroups")
    private readonly permissionGroupModel: Model<PermissionGroup>,
    private readonly jwtService: JwtService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  private normalizeUserStatus(status = "all"): "all" | "active" | "unactive" {
    const safeStatus = String(status || "all").trim().toLowerCase()
    if (safeStatus === "all" || safeStatus === "active" || safeStatus === "unactive") {
      return safeStatus
    }
    throw new HttpException(
      "status must be one of: active, unactive, all",
      HttpStatus.BAD_REQUEST
    )
  }

  private buildUserStatusFilter(status = "all"): Record<string, any> {
    const safeStatus = this.normalizeUserStatus(status)
    if (safeStatus === "active") {
      return { active: { $ne: false } }
    }
    if (safeStatus === "unactive") {
      return { active: false }
    }
    return {}
  }

  async login(
    credential: LoginDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const username = credential.username
    try {
      const existingUser = await this.userModel
        .findOne({
          username: credential.username
        })
        .exec()

      if (!existingUser) {
        // log failed login
        void this.systemLogsService.createSystemLog(
          {
            type: "auth",
            action: "login_failed",
            entity: "user",
            entityId: username,
            result: "failed"
          },
          "unknown"
        )
        throw new HttpException("Wrong username", HttpStatus.UNAUTHORIZED)
      }

      if (existingUser.password !== credential.password) {
        // log failed login
        void this.systemLogsService.createSystemLog(
          {
            type: "auth",
            action: "login_failed",
            entity: "user",
            entityId: username,
            result: "failed"
          },
          existingUser._id.toString()
        )
        throw new HttpException("Wrong password", HttpStatus.UNAUTHORIZED)
      }

      if (existingUser.active === false) {
        void this.systemLogsService.createSystemLog(
          {
            type: "auth",
            action: "login_failed",
            entity: "user",
            entityId: username,
            result: "failed",
            meta: { reason: "deactivated" }
          },
          existingUser._id.toString()
        )
        throw new HttpException("User is deactivated", HttpStatus.FORBIDDEN)
      }

      const payload = {
        username: existingUser.username,
        sub: existingUser._id.toString()
      }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })

      // log success login
      void this.systemLogsService.createSystemLog(
        {
          type: "auth",
          action: "login_success",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success"
        },
        existingUser._id.toString()
      )

      return { accessToken, refreshToken }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      // unexpected error log
      void this.systemLogsService.createSystemLog(
        {
          type: "system",
          action: "unexpected_error",
          entity: "auth",
          entityId: username,
          result: "failed",
          meta: { scope: "login" }
        },
        "unknown"
      )
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async refreshToken(
    credential: RefreshTokenDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = this.jwtService.verify(credential.refreshToken)
      const payload = {
        username: decoded.username,
        sub: decoded.sub
      }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })

      // per request, do not log token refresh actions
      return { accessToken, refreshToken }
    } catch (error) {
      // per request, do not log token refresh failures
      throw new HttpException("Invalid refresh token", HttpStatus.UNAUTHORIZED)
    }
  }

  async isTokenValid(credential: ValidTokenDto): Promise<{ valid: boolean }> {
    try {
      this.jwtService.verify(credential.accessToken)
      return { valid: true }
    } catch (error) {
      return { valid: false }
    }
  }

  async getMe(username: string): Promise<{
    username: string
    name: string
    roles: string[]
    permissions: string[]
    avatarUrl?: string
    active: boolean
    _id: string
  }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      return {
        username: existingUser.username,
        name: existingUser.name,
        roles: existingUser.roles,
        permissions: existingUser.permissions || [],
        avatarUrl: existingUser.avatarUrl,
        active: existingUser.active !== false,
        _id: existingUser._id.toString()
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async changePassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username: dto.username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      if (existingUser.password !== dto.oldPassword) {
        throw new HttpException("Wrong password", HttpStatus.UNAUTHORIZED)
      }

      existingUser.password = dto.newPassword
      await existingUser.save()

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "password_changed",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success"
        },
        existingUser._id.toString()
      )

      return { message: "Password changed successfully" }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateAvatar(
    username: string,
    avatarUrl: string
  ): Promise<{ message: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      existingUser.avatarUrl = avatarUrl
      await existingUser.save()

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "avatar_updated",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success"
        },
        existingUser._id.toString()
      )

      return { message: "Avatar updated successfully" }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateUser(
    username: string,
    dto: UpdateUserDto
  ): Promise<{ message: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      existingUser.name = dto.name
      await existingUser.save()

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "profile_updated",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success",
          meta: { fields: Object.keys(dto) }
        },
        existingUser._id.toString()
      )

      return { message: "User updated successfully" }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateUserActive(
    userId: string,
    active: boolean,
    actorUsername: string
  ): Promise<{ message: string; data: { _id: string; active: boolean } }> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new HttpException("Invalid user id", HttpStatus.BAD_REQUEST)
      }

      const existingUser = await this.userModel.findById(userId).exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      existingUser.active = active
      await existingUser.save()

      const actor = await this.userModel
        .findOne({ username: actorUsername }, { _id: 1 })
        .lean()

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "active_updated",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success",
          meta: {
            active,
            actorUsername
          }
        },
        actor?._id?.toString() || existingUser._id.toString()
      )

      return {
        message: `User ${active ? "activated" : "deactivated"} successfully`,
        data: {
          _id: existingUser._id.toString(),
          active: existingUser.active !== false
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateUserRoles(
    userId: string,
    roles: string[],
    actorUsername: string
  ): Promise<{ message: string; data: { _id: string; roles: string[] } }> {
    const normalized = Array.from(new Set((roles || []).map((role) => String(role).trim()).filter(Boolean)))
    if (!normalized.length) throw new HttpException("Người dùng cần ít nhất một role", HttpStatus.BAD_REQUEST)
    const user = await this.userModel.findByIdAndUpdate(userId, { $set: { roles: normalized } }, { new: true })
    if (!user) throw new HttpException("User not found", HttpStatus.NOT_FOUND)
    void this.systemLogsService.createSystemLog({ type: "users", action: "updated_roles", entity: "user", entityId: userId, result: "success", meta: { roles: normalized } }, actorUsername)
    return { message: "Cập nhật role thành công", data: { _id: user._id.toString(), roles: user.roles } }
  }

  async listPermissions(): Promise<
    Array<{
      key: string
      label: string
      description?: string
      module?: string
      source?: { method: string; path: string; handler: string }
    }>
  > {
    const permissions = await this.permissionModel
      .find({}, { _id: 0, key: 1, label: 1, description: 1, module: 1, source: 1 })
      .sort({ module: 1, key: 1 })
      .lean()

    return permissions.map((permission) => ({
      key: permission.key,
      label: permission.label,
      description: permission.description,
      module: permission.module,
      source: permission.source
    }))
  }

  async listPermissionGroups(): Promise<
    Array<{ key: string; label: string; permissionKeys: string[]; kind?: string }>
  > {
    const groups = await this.permissionGroupModel
      .find({}, { _id: 0, key: 1, label: 1, permissionKeys: 1, kind: 1 })
      .sort({ label: 1, key: 1 })
      .lean()

    return groups.map((group) => ({
      key: group.key,
      label: group.label,
      permissionKeys: group.permissionKeys || [],
      kind: group.kind
    }))
  }

  async updateUserPermissions(
    userId: string,
    permissionKeys: string[],
    actorUsername: string
  ): Promise<{ message: string; data: { _id: string; permissions: string[] } }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException("Invalid user id", HttpStatus.BAD_REQUEST)
    }

    const normalized = Array.from(
      new Set((permissionKeys || []).map((key) => String(key).trim()).filter(Boolean))
    ).sort()
    const validKeys = await this.permissionModel.distinct("key", { key: { $in: normalized } })
    const invalidKeys = normalized.filter((key) => !validKeys.includes(key))
    if (invalidKeys.length) {
      throw new HttpException(
        `Permission không tồn tại: ${invalidKeys.join(", ")}`,
        HttpStatus.BAD_REQUEST
      )
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { permissions: normalized } },
      { new: true }
    )
    if (!user) throw new HttpException("User not found", HttpStatus.NOT_FOUND)

    void this.systemLogsService.createSystemLog(
      {
        type: "users",
        action: "updated_permissions",
        entity: "user",
        entityId: userId,
        result: "success",
        meta: { permissions: normalized }
      },
      actorUsername
    )

    return {
      message: "Cập nhật permission thành công",
      data: { _id: user._id.toString(), permissions: user.permissions || [] }
    }
  }

  async adminListUsers(
    searchText: string,
    permission?: string,
    status = "all",
    page = 1,
    limit = 10
  ): Promise<{
    data: {
      _id: string
      username: string
      name: string
      roles: string[]
      permissions: string[]
      avatarUrl?: string
      active: boolean
    }[]
    total: number
  }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = {
        ...this.buildUserStatusFilter(status)
      }

      if (searchText && String(searchText).trim().length > 0) {
        const safeSearchText = String(searchText).trim()
        filter.$or = [
          {
            name: {
              $regex: `.*${safeSearchText}.*`,
              $options: "i"
            }
          },
          {
            username: {
              $regex: `.*${safeSearchText}.*`,
              $options: "i"
            }
          }
        ]
      }

      if (permission && String(permission).trim().length > 0) {
        filter.permissions = permission
      }

      const [users, total] = await Promise.all([
        this.userModel
          .find(filter)
          .sort({ name: 1, username: 1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        this.userModel.countDocuments(filter)
      ])

      return {
        data: users.map((u) => ({
          _id: u._id.toString(),
          username: u.username,
          name: u.name,
          roles: Array.isArray(u.roles) ? u.roles : [],
          permissions: Array.isArray(u.permissions) ? u.permissions : [],
          avatarUrl: u.avatarUrl,
          active: u.active !== false
        })),
        total
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async adminGetUser(userId: string): Promise<{
    _id: string
    username: string
    name: string
    permissions: string[]
    avatarUrl?: string
    active: boolean
  }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException("Invalid user id", HttpStatus.BAD_REQUEST)
    }

    const user = await this.userModel.findById(userId).lean()
    if (!user) {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND)
    }

    return {
      _id: user._id.toString(),
      username: user.username,
      name: user.name,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      avatarUrl: user.avatarUrl,
      active: user.active !== false
    }
  }

  async publicSearchUsers(
    searchText: string,
    permission?: string,
    status = "all",
    page = 1,
    limit = 10
  ): Promise<{ data: { _id: string; name: string }[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = {
        ...this.buildUserStatusFilter(status)
      }
      if (searchText && String(searchText).trim().length > 0) {
        filter.name = {
          $regex: `.*${String(searchText).trim()}.*`,
          $options: "i"
        }
      }
      if (permission && String(permission).trim().length > 0) {
        filter.permissions = permission
      }

      const [users, total] = await Promise.all([
        this.userModel
          .find(filter)
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        this.userModel.countDocuments(filter)
      ])

      return {
        data: users.map((u) => ({ _id: u._id.toString(), name: u.name })),
        total
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
