import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common"
import { PATH_METADATA } from "@nestjs/common/constants"
import { Reflector } from "@nestjs/core"
import { PERMISSIONS_KEY } from "./permissions.decorator"

const toKebabCase = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()

const controllerPath = (context: ExecutionContext): string => {
  const value = Reflect.getMetadata(PATH_METADATA, context.getClass())
  const path = Array.isArray(value) ? value[0] : value
  return String(path || "").replace(/^\/+|\/+$/g, "")
}

export const getApiPermissionKey = (context: ExecutionContext): string => {
  const path = controllerPath(context)
  const handler = context.getHandler()?.name
  if (!path || !handler) {
    throw new ForbiddenException("Không thể xác định quyền truy cập endpoint")
  }
  return `api.${path}.${toKebabCase(handler)}`
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const declaredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    )

    // No @Permissions metadata means this endpoint is not permission-gated.
    if (declaredPermissions === undefined) return true

    const { user } = context.switchToHttp().getRequest()
    if (!user) throw new ForbiddenException("Bạn chưa đăng nhập")

    const requiredPermissions =
      declaredPermissions.length > 0
        ? declaredPermissions
        : [getApiPermissionKey(context)]
    const userPermissions = Array.isArray(user.permissions) ? user.permissions : []

    if (!requiredPermissions.some((permission) => userPermissions.includes(permission))) {
      throw new ForbiddenException("Bạn không có quyền truy cập")
    }
    return true
  }
}
