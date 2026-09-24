import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PricingModule } from "../pricing/pricing.module";
import { PosCheckoutsController } from "./pos-checkouts.controller";
import { PosCheckoutsService } from "./pos-checkouts.service";

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [PosCheckoutsController],
  providers: [PrismaService, PosCheckoutsService],
  exports: [PosCheckoutsService],
})
export class PosCheckoutsModule {}
