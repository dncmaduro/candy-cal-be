import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
  Patch,
  Query,
  Param
} from "@nestjs/common"
import { UsersService } from "./users.service"
import { LoginDto, RefreshTokenDto, ValidTokenDto } from "./dto/login.dto"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { PermissionsGuard } from "../permissions/permissions.guard"

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() credential: LoginDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.usersService.login(credential)
  }

  @Post("refresh-token")
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() credential: RefreshTokenDto
  ): Promise<{ accessToken: string }> {
    return this.usersService.refreshToken(credential)
  }

  @Post("check-token")
  @HttpCode(HttpStatus.OK)
  async isTokenValid(
    @Body() credential: ValidTokenDto
  ): Promise<{ valid: boolean }> {
    return this.usersService.isTokenValid(credential)
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req): Promise<{
    username: string
    name: string
    roles: string[]
    permissions: string[]
    avatarUrl?: string
    active: boolean
    _id: string
  }> {
    return this.usersService.getMe(req.user.username)
  }

  @UseGuards(JwtAuthGuard)
  @Patch("change-password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() body: { oldPassword: string; newPassword: string },
    @Req() req
  ): Promise<{ message: string }> {
    return this.usersService.changePassword({
      username: req.user.username,
      oldPassword: body.oldPassword,
      newPassword: body.newPassword
    })
  }

  @UseGuards(JwtAuthGuard)
  @Patch("avatar")
  @HttpCode(HttpStatus.OK)
  async updateAvatar(
    @Body() body: { avatarUrl: string },
    @Req() req
  ): Promise<{ message: string }> {
    return this.usersService.updateAvatar(req.user.username, body.avatarUrl)
  }

  @UseGuards(JwtAuthGuard)
  @Patch("update")
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Body() body: { name: string },
    @Req() req
  ): Promise<{ message: string }> {
    return this.usersService.updateUser(req.user.username, { name: body.name })
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions()
  @Get("admin/list")
  @HttpCode(HttpStatus.OK)
  async adminListUsers(
    @Query("searchText") searchText: string,
    @Query("permission") permission?: string,
    @Query("status") status = "all",
    @Query("page") page = 1,
    @Query("limit") limit = 10
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
    return this.usersService.adminListUsers(
      searchText,
      permission,
      status,
      Number(page),
      Number(limit)
    )
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("api.users.admin-list-users")
  @Get("admin/:userId")
  @HttpCode(HttpStatus.OK)
  async adminGetUser(@Param("userId") userId: string) {
    return this.usersService.adminGetUser(userId)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions()
  @Patch(":userId/active")
  @HttpCode(HttpStatus.OK)
  async updateUserActive(
    @Req() req,
    @Body() body: { active: boolean },
    @Param("userId") userId: string
  ): Promise<{ message: string; data: { _id: string; active: boolean } }> {
    return this.usersService.updateUserActive(
      userId,
      body.active,
      req.user.username
    )
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions()
  @Patch(":userId/roles")
  @HttpCode(HttpStatus.OK)
  async updateUserRoles(
    @Req() req,
    @Body() body: { roles: string[] },
    @Param("userId") userId: string
  ): Promise<{ message: string; data: { _id: string; roles: string[] } }> {
    return this.usersService.updateUserRoles(userId, body.roles, req.user.username)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("api.users.admin-list-users")
  @Get("permissions")
  @HttpCode(HttpStatus.OK)
  async listPermissions() {
    return { data: await this.usersService.listPermissions() }
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("api.users.admin-list-users")
  @Get("permission-groups")
  @HttpCode(HttpStatus.OK)
  async listPermissionGroups() {
    return { data: await this.usersService.listPermissionGroups() }
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("api.users.update-user-roles")
  @Patch(":userId/permissions")
  @HttpCode(HttpStatus.OK)
  async updateUserPermissions(
    @Req() req,
    @Body() body: { permissions: string[] },
    @Param("userId") userId: string
  ): Promise<{ message: string; data: { _id: string; permissions: string[] } }> {
    return this.usersService.updateUserPermissions(
      userId,
      body.permissions,
      req.user.username
    )
  }

  @UseGuards(JwtAuthGuard)
  @Get("publicsearch")
  @HttpCode(HttpStatus.OK)
  async publicSearchUsers(
    @Query("searchText") searchText: string,
    @Query("permission") permission?: string,
    @Query("status") status = "all",
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: { _id: string; name: string }[]; total: number }> {
    return this.usersService.publicSearchUsers(
      searchText,
      permission,
      status,
      Number(page),
      Number(limit)
    )
  }
}
