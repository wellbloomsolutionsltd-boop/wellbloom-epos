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
import {
  Roles,
} from "../auth/roles.decorator";
import {
  RolesGuard,
} from "../auth/roles.guard";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { VoidSaleDto } from "./dto/void-sale.dto";
import { SalesService } from "./sales.service";

@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
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

  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
  )
  @Post(":id/void")
  voidSale(
    @Param("id")
    id: string,

    @Body()
    dto: VoidSaleDto,

    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.salesService
      .voidSale(
        id,
        dto.reason,
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
