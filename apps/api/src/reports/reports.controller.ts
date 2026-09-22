import {
  Controller,
  Get,
  Inject,
  Query,
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

import {
  ReportRangeDto,
} from "./dto/report-range.dto";

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

  @Get("sales/period")
  getSalesPeriod(
    @Query() query: ReportRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getSalesByPeriod(
      user,
      query.startDate,
      query.endDate,
      query.branchId,
    );
  }

  @Get("sales/monthly")
  getMonthlySales(
    @Query("year") year: string,
    @Query("branchId") branchId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsedYear = Number(year) || new Date().getFullYear();
    return this.reportsService.getMonthlySales(
      user,
      parsedYear,
      branchId,
    );
  }

  @Get("sales/by-branch")
  getSalesByBranch(
    @Query() query: ReportRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getSalesByBranch(
      user,
      query.startDate,
      query.endDate,
    );
  }

  @Get("sales/by-product")
  getSalesByProduct(
    @Query() query: ReportRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getSalesByProduct(
      user,
      query.startDate,
      query.endDate,
      query.branchId,
    );
  }

  @Get("inventory/valuation")
  getStockValuation(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getStockValuation(user);
  }

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "ACCOUNTANT",
    "REPORT_VIEWER",
  )
  @Get("payments/reconciliation")
  getPaymentReconciliation(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getPaymentReconciliation(user);
  }
}
