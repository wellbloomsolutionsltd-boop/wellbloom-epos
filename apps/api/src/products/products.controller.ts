import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(
    @Inject(ProductsService)
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get("barcode/:barcode")
  findByBarcode(@Param("barcode") barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }
}
