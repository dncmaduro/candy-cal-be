import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable
} from "@nestjs/common"
import { Request, Response } from "express"
import { SystemLogsService } from "../../systemlogs/systemlogs.service"

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : 500

    // Derive basic info
    const user: any = (request as any).user || {}
    const userId = user.userId || "unknown"
    const ip = (request.headers["x-forwarded-for"] as string) || request.ip
    const userAgent = request.headers["user-agent"] as string

    // Determine type/action
    let type = "system"
    let action = "unexpected_error"

    if (isHttp) {
      if (status === 403) {
        type = "security"
        action = "permission_denied"
      } else if (status === 400) {
        type = "security"
        action = "validation_failed"
      }
    }

    // Log asynchronously; do not block response
    void this.systemLogsService.createSystemLog(
      {
        type,
        action,
        result: "failed",
        entity: "http",
        entityId: request.path,
        ip,
        userAgent,
        meta: {
          status,
          method: request.method,
          path: request.path,
          message: isHttp
            ? (exception as HttpException).message
            : (exception as Error)?.message,
          // Avoid large stack
          stack: isHttp
            ? undefined
            : (exception as Error)?.stack?.split("\n").slice(0, 5).join("\n")
        }
      },
      userId
    )

    // Continue default behavior
    if (isHttp) {
      response
        .status(status)
        .json((exception as HttpException).getResponse() as any)
    } else {
      response.status(status).json({
        statusCode: status,
        message: "Internal server error"
      })
    }
  }
}
