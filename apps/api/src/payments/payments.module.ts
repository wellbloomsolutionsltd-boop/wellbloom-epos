import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PosCheckoutsModule } from "../pos-checkouts/pos-checkouts.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentsController } from "./payments.controller";
import { MpesaService } from "./mpesa/mpesa.service";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [PrismaModule, OrdersModule, PosCheckoutsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MpesaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
