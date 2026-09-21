import {
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";

import {
  Cron,
} from "@nestjs/schedule";

import {
  OrdersService,
} from "./orders.service";

@Injectable()
export class ReservationExpiryScheduler {
  private readonly logger =
    new Logger(
      ReservationExpiryScheduler.name,
    );

  constructor(
    @Inject(OrdersService)
    private readonly ordersService:
      OrdersService,
  ) {}

  @Cron(
    "0 * * * * *",
    {
      name:
        "inventory-reservation-expiry",
      waitForCompletion:
        true,
    },
  )
  async releaseExpiredReservations() {
    try {
      const result =
        await this.ordersService
          .releaseExpiredReservations();

      if (result.checked > 0) {
        this.logger.log(
          `Checked ${result.checked} expired reservation order(s); released ${result.releasedCount} inventory reservation(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        "Automatic reservation expiry failed",
        error instanceof Error
          ? error.stack
          : String(error),
      );
    }
  }
}
