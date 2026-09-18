import {
  Controller,
  Get,
  Inject,
  UseGuards,
} from "@nestjs/common";

import {
  CurrentUser,
} from "../auth/current-user.decorator";

import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";

import {
  Roles,
} from "../auth/roles.decorator";

import {
  RolesGuard,
} from "../auth/roles.guard";

import {
  ReportsService,
} from "./reports.service";

@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
@Controller("reports")
export class ReportsController {
  constructor(
    @Inject(ReportsService)
    private readonly reportsService:
      ReportsService,
  ) {}

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "ACCOUNTANT",
    "REPORT_VIEWER",
  )
  @Get("dashboard/today")
  getTodayDashboard(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.reportsService
      .getTodayDashboard(
        user,
      );
  }
}
