import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Observable, tap } from "rxjs"
import { Model, Types } from "mongoose"
import { RequestAudit } from "../../database/mongoose/schemas/RequestAudit"

function formatDateKey(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
}

function normalizePath(req: any): string {
  const routePath: string | undefined = req.route?.path
  const baseUrl: string = req.baseUrl || ""
  let path =
    ("/" + [baseUrl, routePath || req.path].filter(Boolean).join("/"))
      .replace(/\/+/g, "/")
      .replace(/\/+$/, "") || "/"
  // remove global prefix /api or /api/vN to align with autodiscover keys
  path = path.replace(/^\/api(?:\/v\d+)?(?=\/|$)/, "")
  if (!path.startsWith("/")) path = "/" + path
  return path || "/"
}

function buildEndpointKey(method: string, path: string) {
  return `${method.toUpperCase()}-${path.replace(/[:/]/g, "_")}`
}

function shouldSkipAudit(path: string): boolean {
  // Match /auth, /dailytasks, /api-endpoints with optional /api or /api/vN prefix
  return /^(?:\/api(?:\/v\d+)?)?\/(auth|dailytasks|api-endpoints)(\/|$)/.test(
    path
  )
}

@Injectable()
export class RequestAuditInterceptor implements NestInterceptor {
  constructor(
    @InjectModel("RequestAudit")
    private readonly auditModel: Model<RequestAudit>
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp()
    const req = httpCtx.getRequest()
    const userId: string | undefined = req.user?.userId
    const method: string = req.method
    const path: string = normalizePath(req)

    if (shouldSkipAudit(path)) {
      return next.handle()
    }

    const endpointKey = buildEndpointKey(method, path)
    const dateKey = formatDateKey(new Date())

    return next.handle().pipe(
      tap({
        next: async () => {
          const statusCode = httpCtx.getResponse()?.statusCode
          try {
            await this.auditModel.create({
              userId: userId ? new Types.ObjectId(userId) : undefined,
              method,
              path,
              endpointKey,
              date: dateKey,
              occurredAt: new Date(),
              statusCode
            })
          } catch {
            // ignore
          }
        },
        error: async () => {
          const statusCode = httpCtx.getResponse()?.statusCode
          try {
            await this.auditModel.create({
              userId: userId ? new Types.ObjectId(userId) : undefined,
              method,
              path,
              endpointKey,
              date: dateKey,
              occurredAt: new Date(),
              statusCode
            })
          } catch {
            // ignore
          }
        }
      })
    )
  }
}
