import {
  Controller,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";
import { ProductsService } from "./products.service";

@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductsController {
  constructor(
    @Inject(ProductsService)
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.findAll(user);
  }

  @Get("barcode/:barcode")
  findByBarcode(
    @Param("barcode") barcode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.findByBarcode(
      barcode,
      user,
    );
  }
}
