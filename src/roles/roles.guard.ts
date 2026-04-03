import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ROLES_KEY } from "./roles.decorator"
import { expandRoleAliases } from "./role-aliases"

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    )
    if (!requiredRoles) return true

    const { user } = context.switchToHttp().getRequest()
    if (!user) throw new ForbiddenException("Bạn chưa đăng nhập")

    const userRoles: string[] = Array.isArray(user.roles)
      ? user.roles
      : user.role
        ? [user.role]
        : []

    const expandedUserRoles = expandRoleAliases(userRoles)
    const expandedRequiredRoles = expandRoleAliases(requiredRoles)
    const hasRole = expandedRequiredRoles.some((r) =>
      expandedUserRoles.includes(r)
    )
    if (!hasRole) {
      throw new ForbiddenException("Bạn không có quyền truy cập")
    }
    return true
  }
}
