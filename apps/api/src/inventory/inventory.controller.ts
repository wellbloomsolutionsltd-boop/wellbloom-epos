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
  AuthenticatedUser,
} from "../auth/jwt-auth.guard";

import {
  CurrentUser,
} from "../auth/current-user.decorator";

import {
  Roles,
} from "../auth/roles.decorator";

import {
  RolesGuard,
} from "../auth/roles.guard";

import {
  InventoryService,
} from "./inventory.service";

@UseGuards(JwtAuthGuard, RolesGuard)
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
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.inventoryService
      .getProductAvailability(
        productId,
        branchId,
        user,
      );
  }

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "INVENTORY_MANAGER",
    "REPORT_VIEWER",
  )
  @Get("products/:productId/movements")
  movements(
    @Param("productId")
    productId: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.inventoryService.getProductMovements(
      productId,
      user,
    );
  }
}
