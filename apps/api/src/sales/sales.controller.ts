import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";
import {
  CurrentUser,
} from "../auth/current-user.decorator";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { SalesService } from "./sales.service";

@UseGuards(JwtAuthGuard)
@Controller("sales")
export class SalesController {
  constructor(
    @Inject(SalesService)
    private readonly salesService: SalesService,
  ) {}

  @Post()
  createSale(
    @Body() createSaleDto: CreateSaleDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.salesService.createSale(
      createSaleDto,
      user,
    );
  }

  @Get()
  findAll(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.salesService.findAll(user);
  }

  @Get("search/:term")
  search(
    @Param("term") term: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.salesService.search(term, user);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.salesService.findOne(id, user);
  }
}
