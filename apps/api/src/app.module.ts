import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from "@nestjs/common";
import {
  APP_FILTER,
  APP_GUARD,
} from "@nestjs/core";
import {
  ScheduleModule,
} from "@nestjs/schedule";
import {
  ThrottlerGuard,
  ThrottlerModule,
} from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsModule } from "./products/products.module";
import { SalesModule } from "./sales/sales.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import {
  ShiftsModule,
} from "./shifts/shifts.module";
import {
  EndOfDayModule,
} from "./end-of-day/end-of-day.module";
import {
  ReturnsModule,
} from "./returns/returns.module";
import {
  CustomersModule,
} from "./customers/customers.module";
import {
  ReportsModule,
} from "./reports/reports.module";
import {
  OrdersModule,
} from "./orders/orders.module";
import {
  InventoryModule,
} from "./inventory/inventory.module";
import {
  PaymentsModule,
} from "./payments/payments.module";
import {
  PosCheckoutsModule,
} from "./pos-checkouts/pos-checkouts.module";
import {
  PricingModule,
} from "./pricing/pricing.module";
import {
  RequestIdMiddleware,
} from "./common/middleware/request-id.middleware";
import {
  AllExceptionsFilter,
} from "./common/filters/all-exceptions.filter";
import {
  HealthModule,
} from "./health/health.module";

@Module({
  controllers: [AppController],
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          limit: 120,
        },
      ],
    }),
    PrismaModule,
    ProductsModule,
    SalesModule,
    UsersModule,
    AuthModule,
    ShiftsModule,
    EndOfDayModule,
    ReturnsModule,
    CustomersModule,
    ReportsModule,
    OrdersModule,
    InventoryModule,
    PaymentsModule,
    PosCheckoutsModule,
    PricingModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule
  implements NestModule
{
  configure(
    consumer: MiddlewareConsumer,
  ) {
    consumer
      .apply(
        RequestIdMiddleware,
      )
      .forRoutes("*");
  }
}
