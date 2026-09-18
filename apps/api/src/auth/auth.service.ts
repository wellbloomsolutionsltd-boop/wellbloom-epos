import {
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          code: dto.tenantCode.toUpperCase(),
        },
      });

    if (!tenant) {
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
      throw new UnauthorizedException(
        "Invalid login credentials",
      );
    }

    const payload = {
      sub: user.id,

      tenantId: user.tenantId,

      branchId: user.branchId,

      role: user.role,

      email: user.email,
    };

    const accessToken =
      await this.jwtService.signAsync(
        payload,
      );

    return {
      accessToken,

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
}
