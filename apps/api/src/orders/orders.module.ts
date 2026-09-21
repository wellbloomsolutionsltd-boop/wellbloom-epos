import {
  Module,
} from "@nestjs/common";

import {
  OrdersController,
} from "./orders.controller";

import {
  OrdersService,
} from "./orders.service";

import {
  ReservationExpiryScheduler,
} from "./reservation-expiry.scheduler";
import { PricingModule } from "../pricing/pricing.module";

@Module({
  imports: [PricingModule],
  controllers: [
    OrdersController,
  ],
  providers: [
    OrdersService,
    ReservationExpiryScheduler,
  ],
  exports: [
    OrdersService,
  ],
})
export class OrdersModule {}