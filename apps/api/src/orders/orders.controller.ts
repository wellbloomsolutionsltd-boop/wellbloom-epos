import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  CurrentUser,
} from "../auth/current-user.decorator";

import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";

import {
  CreateOrderDto,
} from "./dto/create-order.dto";

import {
  OrdersService,
} from "./orders.service";

@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(
    @Inject(OrdersService)
    private readonly ordersService:
      OrdersService,
  ) {}

  @Post()
  create(
    @Body()
    dto: CreateOrderDto,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.ordersService.createOrder(
      dto,
      user,
    );
  }

  @Post(":id/cancel")
  cancel(
    @Param("id")
    id: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.ordersService.cancelOrder(
      id,
      user,
    );
  }
}