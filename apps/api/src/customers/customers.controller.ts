import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../auth/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@UseGuards(JwtAuthGuard)
@Controller("customers")
export class CustomersController {
  constructor(
    @Inject(CustomersService)
    private readonly customersService: CustomersService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.findAll(user);
  }

  @Get("search/:term")
  search(
    @Param("term") term: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.search(term, user);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.findOne(id, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, user);
  }
}
