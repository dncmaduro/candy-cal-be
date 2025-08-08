import { Controller, UseGuards } from "@nestjs/common";
import { SystemLogsService } from "./systemlogs.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../roles/roles.guard";

@Controller("systemlogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Roles
}