import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "./jwt-auth.guard";
import { LoginDto } from "./dto/login.dto";
import {
  RefreshTokenDto,
} from "./dto/refresh-token.dto";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Post("login")
  login(
    @Body() dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.refresh(
      dto.refreshToken,
    );
  }

  @Post("logout")
  logout(
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.logout(
      dto.refreshToken,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout-all")
  logoutAll(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.authService.logoutAll(
      user.sub,
    );
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
