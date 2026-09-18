import { Module } from "@nestjs/common";
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

@Module({
  controllers: [AppController],
  imports: [
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
  ],
})
export class AppModule {}
