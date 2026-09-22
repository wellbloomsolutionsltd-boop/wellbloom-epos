import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { UsersModule } from "../users/users.module";
import {
  createAccessTokenJwtOptions,
} from "./jwt.config";

@Module({
  imports: [
    UsersModule,

    JwtModule.registerAsync({
      global: true,
      useFactory:
        createAccessTokenJwtOptions,
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtAuthGuard, RolesGuard],

  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
