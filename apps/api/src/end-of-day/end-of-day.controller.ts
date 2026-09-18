import {
  Body,
  Controller,
  Get,
  Inject,
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
  CloseEndOfDayDto,
} from "./dto/close-end-of-day.dto";

import {
  EndOfDayService,
} from "./end-of-day.service";

@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
@Controller("end-of-day")
export class EndOfDayController {
  constructor(
    @Inject(EndOfDayService)
    private readonly endOfDayService:
      EndOfDayService,
  ) {}

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
  )
  @Get("current")
  getCurrent(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.endOfDayService
      .getCurrentSummary(user);
  }

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
  )
  @Post("close")
  close(
    @Body()
    dto: CloseEndOfDayDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.endOfDayService
      .closeEndOfDay(
        dto,
        user,
      );
  }

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
  )
  @Get("history")
  history(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.endOfDayService
      .getHistory(user);
  }
}
