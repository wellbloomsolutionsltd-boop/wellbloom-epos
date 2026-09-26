import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type {
  Request,
  Response,
} from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "./jwt-auth.guard";
import { LoginDto } from "./dto/login.dto";
import {
  Throttle,
} from "@nestjs/throttler";
import {
  clearRefreshCookie,
  requireRefreshCookie,
  setRefreshCookie,
} from "./refresh-cookie";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Throttle({
    default: {
      limit: 8,
      ttl: 60_000,
    },
  })
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result =
      await this.authService.login(dto);

    setRefreshCookie(
      response,
      result.refreshToken,
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post("refresh")
  @Throttle({
    default: {
      limit: 12,
      ttl: 60_000,
    },
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result =
      await this.authService.refresh(
        requireRefreshCookie(request),
      );

    setRefreshCookie(
      response,
      result.refreshToken,
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    try {
      return await this.authService.logout(
        requireRefreshCookie(request),
      );
    } finally {
      clearRefreshCookie(response);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout-all")
  async logoutAll(
    @CurrentUser()
    user: AuthenticatedUser,
    @Res({ passthrough: true })
    response: Response,
  ) {
    try {
      return await this.authService.logoutAll(
        user.sub,
      );
    } finally {
      clearRefreshCookie(response);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }
}
