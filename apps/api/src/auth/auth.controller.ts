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

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }
}
