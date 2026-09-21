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
import { CreatePosCheckoutDto } from "./dto/create-pos-checkout.dto";
import { PosCheckoutsService } from "./pos-checkouts.service";

@Controller("pos-checkouts")
@UseGuards(JwtAuthGuard)
export class PosCheckoutsController {
  constructor(
    @Inject(PosCheckoutsService)
    private readonly posCheckoutsService: PosCheckoutsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreatePosCheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posCheckoutsService.create(dto, user);
  }

  @Get(":id/status")
  status(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posCheckoutsService.getStatus(id, user);
  }
}
