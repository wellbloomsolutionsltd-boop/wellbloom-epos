import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PosCheckoutsController } from "./pos-checkouts.controller";
import { PosCheckoutsService } from "./pos-checkouts.service";

@Module({
  imports: [PrismaModule],
  controllers: [PosCheckoutsController],
  providers: [PrismaService, PosCheckoutsService],
  exports: [PosCheckoutsService],
})
export class PosCheckoutsModule {}
