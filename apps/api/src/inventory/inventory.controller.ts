import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";

import {
  InventoryService,
} from "./inventory.service";

@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(
    @Inject(InventoryService)
    private readonly inventoryService:
      InventoryService,
  ) {}

  @Get("products/:productId/availability")
  getProductAvailability(
    @Param("productId")
    productId: string,
    @Query("branchId")
    branchId: string,
  ) {
    return this.inventoryService
      .getProductAvailability(
        productId,
        branchId,
      );
  }
}