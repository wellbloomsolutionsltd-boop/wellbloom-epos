import {
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import {
  getJwtEnvironmentConfig,
} from "./jwt.config";
import type {
  AuthenticatedUser,
} from "./jwt-auth.guard";
import { AuditService } from "../audit/audit.service";

type TokenPurpose = "access" | "refresh";

type WellbloomTokenPayload = AuthenticatedUser & {
  tokenUse: TokenPurpose;
  jti: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          code: dto.tenantCode.toUpperCase(),
        },
      });

    if (!tenant) {
      await this.recordLoginFailure();

      throw new UnauthorizedException(
        "Invalid login credentials",
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: tenant.id,
            email: dto.email.toLowerCase(),
          },
        },

        include: {
          branch: true,
          tenant: true,
        },
      });

    if (!user || !user.isActive) {
      await this.recordLoginFailure(
        tenant.id,
        user?.id,
      );

      throw new UnauthorizedException(
        "Invalid login credentials",
      );
    }

    const passwordValid =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (!passwordValid) {
      await this.recordLoginFailure(
        tenant.id,
        user.id,
      );

      throw new UnauthorizedException(
        "Invalid login credentials",
      );
    }

    const payload: AuthenticatedUser = {
      sub: user.id,

      tenantId: user.tenantId,

      branchId: user.branchId,

      role: user.role,

      email: user.email,
    };

    const tokens =
      await this.prisma.$transaction(
        async (tx) => {
          const issued =
            await this.issueTokenPair(
              payload,
              tx,
            );

          await this.auditService.createWithTx(
            tx,
            {
              tenantId: user.tenantId,
              userId: user.id,
              action: "LOGIN_SUCCESS",
              entityType: "USER",
              entityId: user.id,
            },
          );

          return issued;
        },
      );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,

      user: {
        id: user.id,

        firstName: user.firstName,
        lastName: user.lastName,

        email: user.email,

        role: user.role,

        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          code: user.tenant.code,
        },

        branch: user.branch
          ? {
              id: user.branch.id,
              name: user.branch.name,
              code: user.branch.code,
            }
          : null,
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload =
      await this.verifyRefreshToken(
        refreshToken,
      );
    const tokenHash =
      this.hashRefreshToken(
        refreshToken,
      );

    return this.prisma.$transaction(
      async (tx) => {
        const session =
          await tx.refreshTokenSession.findUnique({
            where: {
              tokenId: payload.jti,
            },
          });
        const now = new Date();

        if (
          !session ||
          session.userId !== payload.sub ||
          session.tokenHash !== tokenHash ||
          session.revokedAt !== null ||
          session.expiresAt <= now
        ) {
          throw this.invalidRefreshToken();
        }

        const user =
          await tx.user.findUnique({
            where: {
              id: payload.sub,
            },
          });

        if (
          !user ||
          !user.isActive ||
          user.tenantId !== payload.tenantId
        ) {
          throw this.invalidRefreshToken();
        }

        const revoked =
          await tx.refreshTokenSession.updateMany({
            where: {
              id: session.id,
              revokedAt: null,
              expiresAt: {
                gt: now,
              },
              tokenHash,
            },
            data: {
              revokedAt: now,
            },
          });

        if (revoked.count !== 1) {
          throw this.invalidRefreshToken();
        }

        const tokens =
          await this.issueTokenPair(
            {
              sub: user.id,
              tenantId: user.tenantId,
              branchId: user.branchId,
              role: user.role,
              email: user.email,
            },
            tx,
          );

        await tx.refreshTokenSession.update({
          where: {
            id: session.id,
          },
          data: {
            replacedById:
              tokens.refreshSessionId,
          },
        });

        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        };
      },
    );
  }

  async logout(refreshToken: string) {
    const payload =
      await this.verifyRefreshToken(
        refreshToken,
      );

    await this.prisma.refreshTokenSession.updateMany({
      where: {
        tokenId: payload.jti,
        userId: payload.sub,
        tokenHash:
          this.hashRefreshToken(
            refreshToken,
          ),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshTokenSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  private async issueTokenPair(
    user: AuthenticatedUser,
    client: Pick<
      Prisma.TransactionClient,
      "refreshTokenSession"
    > = this.prisma,
  ) {
    const config = getJwtEnvironmentConfig();
    const refreshTokenId = randomUUID();

    const [accessToken, refreshToken] =
      await Promise.all([
        this.jwtService.signAsync(
          {
            ...user,
            tokenUse: "access",
            jti: randomUUID(),
          } satisfies WellbloomTokenPayload,
          {
            secret: config.accessSecret,
            expiresIn:
              config.accessExpiresIn,
          },
        ),
        this.jwtService.signAsync(
          {
            ...user,
            tokenUse: "refresh",
            jti: refreshTokenId,
          } satisfies WellbloomTokenPayload,
          {
            secret: config.refreshSecret,
            expiresIn:
              config.refreshExpiresIn,
          },
        ),
      ]);

    const decoded =
      this.jwtService.decode<{
        exp?: number;
      }>(refreshToken);

    if (
      !decoded ||
      typeof decoded.exp !== "number"
    ) {
      throw new Error(
        "Unable to create refresh session",
      );
    }

    const session =
      await client.refreshTokenSession.create({
        data: {
          userId: user.sub,
          tokenId: refreshTokenId,
          tokenHash:
            this.hashRefreshToken(
              refreshToken,
            ),
          expiresAt: new Date(
            decoded.exp * 1000,
          ),
        },
      });

    return {
      accessToken,
      refreshToken,
      refreshSessionId: session.id,
    };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ) {
    const config = getJwtEnvironmentConfig();
    let payload: WellbloomTokenPayload;

    try {
      payload =
        await this.jwtService.verifyAsync<WellbloomTokenPayload>(
          refreshToken,
          {
            secret: config.refreshSecret,
          },
        );
    } catch {
      throw this.invalidRefreshToken();
    }

    if (
      payload.tokenUse !== "refresh" ||
      !this.hasValidUserContext(payload)
    ) {
      throw this.invalidRefreshToken();
    }

    return payload;
  }

  private hashRefreshToken(
    refreshToken: string,
  ) {
    return createHash("sha256")
      .update(refreshToken, "utf8")
      .digest("hex");
  }

  private invalidRefreshToken() {
    return new UnauthorizedException(
      "Invalid or expired refresh token",
    );
  }

  private async recordLoginFailure(
    tenantId?: string,
    userId?: string,
  ) {
    try {
      await this.auditService.create({
        tenantId,
        userId,
        action: "LOGIN_FAILURE",
        entityType: userId
          ? "USER"
          : undefined,
        entityId: userId,
        metadata: {
          reason: "INVALID_CREDENTIALS",
        },
      });
    } catch {
      // Authentication failures must remain fail-closed
      // even when audit persistence is unavailable.
    }
  }

  private hasValidUserContext(
    payload: WellbloomTokenPayload,
  ) {
    return (
      typeof payload.sub === "string" &&
      typeof payload.tenantId === "string" &&
      (
        payload.branchId === null ||
        typeof payload.branchId === "string"
      ) &&
      typeof payload.role === "string" &&
      typeof payload.email === "string" &&
      typeof payload.jti === "string"
    );
  }
}
