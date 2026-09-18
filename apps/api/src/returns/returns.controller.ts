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
  CreateReturnDto,
} from "./dto/create-return.dto";

import {
  ReviewReturnDto,
} from "./dto/review-return.dto";

import {
  ReturnsService,
} from "./returns.service";

@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
@Controller("returns")
export class ReturnsController {
  constructor(
    @Inject(ReturnsService)
    private readonly returnsService:
      ReturnsService,
  ) {}

  @Post()
  requestReturn(
    @Body()
    dto: CreateReturnDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.returnsService
      .requestReturn(
        dto,
        user,
      );
  }

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
  )
  @Post(":id/review")
  reviewReturn(
    @Param("id")
    id: string,

    @Body()
    dto: ReviewReturnDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.returnsService
      .reviewReturn(
        id,
        dto,
        user,
      );
  }

  @Get()
  findAll(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.returnsService
      .findAll(user);
  }
}
