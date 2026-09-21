import {
  Body,
  Controller,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SetProductPriceDto } from "./dto/set-product-price.dto";
import { PricingService } from "./pricing.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("pricing")
export class PricingController {
  constructor(
    @Inject(PricingService)
    private readonly pricingService: PricingService,
  ) {}

  @Roles("MANAGER", "TENANT_ADMIN", "SUPER_ADMIN")
  @Post("product-price")
  setProductPrice(
    @Body() dto: SetProductPriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pricingService.setProductPrice(
      dto,
      user.tenantId,
    );
  }
}
