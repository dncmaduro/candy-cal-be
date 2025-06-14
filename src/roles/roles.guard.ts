import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ROLES_KEY } from "./roles.decorator"

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
    console.log(context.switchToHttp().getRequest())
    if (!user) throw new ForbiddenException("No user")

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException("You do not have permission")
    }
    return true
  }
}
