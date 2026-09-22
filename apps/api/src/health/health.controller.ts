import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  PrismaService,
} from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
  ) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`
        SELECT 1
      `;

      return {
        status: "ok",
        database: "ok",
        timestamp:
          new Date()
            .toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException(
        "Database unavailable",
      );
    }
  }
}
