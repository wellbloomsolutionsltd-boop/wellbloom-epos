import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

export type AuthenticatedUser = {
  sub: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService)
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(
        "Authentication required",
      );
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthenticatedUser>(
          token,
        );

      request.user = payload;
    } catch {
      throw new UnauthorizedException(
        "Invalid or expired token",
      );
    }

    return true;
  }

  private extractToken(request: Request) {
    const [type, token] =
      request.headers.authorization?.split(" ") ?? [];

    return type === "Bearer" ? token : undefined;
  }
}
