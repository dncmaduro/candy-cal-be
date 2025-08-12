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

    // Only log non-HTTP (unexpected) errors now per requirement
    if (!isHttp) {
      const user: any = (request as any).user || {}
      const userId = user.userId || "unknown"
      const ip = (request.headers["x-forwarded-for"] as string) || request.ip
      const userAgent = request.headers["user-agent"] as string

      void this.systemLogsService.createSystemLog(
        {
          type: "system",
          action: "unexpected_error",
          result: "failed",
          entity: "http",
          entityId: request.path,
          ip,
          userAgent,
          meta: {
            status,
            method: request.method,
            path: request.path,
            message: (exception as Error)?.message,
            stack: (exception as Error)?.stack
              ?.split("\n")
              .slice(0, 5)
              .join("\n")
          }
        },
        userId
      )
    }

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
