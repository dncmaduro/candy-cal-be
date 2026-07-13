import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { NotificationsModule } from "../notifications/notifications.module"
import { SalesLeadCaseSchema } from "../database/mongoose/schemas/SalesLeadCase"
import { SalesLeadAssignmentSchema } from "../database/mongoose/schemas/SalesLeadAssignment"
import { SalesLeadCallSchema } from "../database/mongoose/schemas/SalesLeadCall"
import { SalesCsAvailabilitySchema } from "../database/mongoose/schemas/SalesCsAvailability"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SalesChannelSchema } from "../database/mongoose/schemas/SalesChannel"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SalesLeadsController } from "./salesleads.controller"
import { SalesLeadsService } from "./salesleads.service"

@Module({ imports: [MongooseModule.forFeature([
  { name: "salesleadcases", schema: SalesLeadCaseSchema }, { name: "salesleadassignments", schema: SalesLeadAssignmentSchema },
  { name: "salesleadcalls", schema: SalesLeadCallSchema }, { name: "salescsavailabilities", schema: SalesCsAvailabilitySchema },
  { name: "salesfunnel", schema: SalesFunnelSchema }, { name: "saleschannels", schema: SalesChannelSchema }, { name: "salesorders", schema: SalesOrderSchema }, { name: "users", schema: UserSchema }
]), NotificationsModule], controllers: [SalesLeadsController], providers: [SalesLeadsService], exports: [SalesLeadsService] })
export class SalesLeadsModule {}
