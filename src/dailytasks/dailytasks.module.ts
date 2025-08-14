import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { DailyTasksService } from "./dailytasks.service"
import { DailyTasksController } from "./dailytasks.controller"
import { RoleTaskDefSchema } from "../database/mongoose/schemas/RoleTaskDef"
import { DailyUserTaskSchema } from "../database/mongoose/schemas/DailyUserTask"
import { UserSchema } from "../database/mongoose/schemas/User"
import { ScheduleModule } from "@nestjs/schedule"
import { DailyTasksCron } from "./dailytasks.cron"
import { ApiEndpointSchema } from "../database/mongoose/schemas/ApiEndpoint"
import { ApiEndpointsService } from "./endpoints/apiendpoints.service"
import { ApiEndpointsController } from "./endpoints/apiendpoints.controller"
import { SystemLogsModule } from "src/systemlogs/systemlogs.module"
import { ApiEndpointAutoDiscoverService } from "./endpoints/apiendpoints.autodiscover"
import { RequestAuditSchema } from "../database/mongoose/schemas/RequestAudit"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { RequestAuditInterceptor } from "./interceptors/request-audit.interceptor"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "RoleTaskDef", schema: RoleTaskDefSchema }
    ]),
    MongooseModule.forFeature([
      { name: "DailyUserTask", schema: DailyUserTaskSchema }
    ]),
    MongooseModule.forFeature([{ name: "users", schema: UserSchema }]),
    MongooseModule.forFeature([
      { name: "ApiEndpoint", schema: ApiEndpointSchema }
    ]),
    MongooseModule.forFeature([
      { name: "RequestAudit", schema: RequestAuditSchema }
    ]),
    ScheduleModule.forRoot(),
    SystemLogsModule
  ],
  providers: [
    DailyTasksService,
    DailyTasksController,
    DailyTasksCron,
    ApiEndpointsService,
    ApiEndpointAutoDiscoverService,
    { provide: APP_INTERCEPTOR, useClass: RequestAuditInterceptor }
  ],
  controllers: [DailyTasksController, ApiEndpointsController],
  exports: [DailyTasksService, ApiEndpointsService]
})
export class DailyTasksModule {}
