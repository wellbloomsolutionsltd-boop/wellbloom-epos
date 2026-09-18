import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
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
  OpenShiftDto,
} from "./dto/open-shift.dto";

import {
  CloseShiftDto,
} from "./dto/close-shift.dto";

import {
  CashMovementRequestDto,
} from "./dto/cash-movement-request.dto";

import {
  ReviewCashMovementDto,
} from "./dto/review-cash-movement.dto";

import {
  ShiftsService,
} from "./shifts.service";

@UseGuards(JwtAuthGuard)
@Controller("shifts")
export class ShiftsController {
  constructor(
    @Inject(ShiftsService)
    private readonly shiftsService:
      ShiftsService,
  ) {}

  @Get("current")
  getCurrentShift(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .getCurrentShift(user);
  }

  @Get("summary")
  getSummary(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .getShiftSummary(user);
  }

  @Post("open")
  openShift(
    @Body()
    dto: OpenShiftDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .openShift(
        dto,
        user,
      );
  }

  @Post("cash-movement-requests")
  requestCashMovement(
    @Body()
    dto: CashMovementRequestDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .requestCashMovement(
        dto,
        user,
      );
  }

  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
  )
  @Post(
    "cash-movement-requests/:id/review",
  )
  reviewCashMovement(
    @Param("id")
    id: string,

    @Body()
    dto: ReviewCashMovementDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .reviewCashMovement(
        id,
        dto,
        user,
      );
  }

  @Post("close")
  closeShift(
    @Body()
    dto: CloseShiftDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .closeShift(
        dto,
        user,
      );
  }

  @Get("history")
  getHistory(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.shiftsService
      .getMyShiftHistory(user);
  }
}
