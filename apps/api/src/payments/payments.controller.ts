import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";
import {
  Roles,
} from "../auth/roles.decorator";
import {
  RolesGuard,
} from "../auth/roles.guard";
import { InitiateMpesaDto } from "./dto/initiate-mpesa.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    @Inject(PaymentsService)
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post("mpesa/stk-push")
  @UseGuards(JwtAuthGuard)
  initiateMpesa(
    @Body() dto: InitiateMpesaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.initiateOrderMpesa(
      dto.orderId,
      dto.phone,
      user,
    );
  }

  @Post("mpesa/pos-stk-push")
  @UseGuards(JwtAuthGuard)
  initiatePosMpesa(
    @Body()
    dto: {
      posCheckoutId: string;
      phone: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.initiatePosMpesa(
      dto.posCheckoutId,
      dto.phone,
      user,
    );
  }

  @Post("mpesa/callback")
  mpesaCallback(@Body() body: unknown) {
    return this.paymentsService.handleMpesaCallback(body);
  }

  @Get("review")
  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "ACCOUNTANT",
    "ECOMMERCE_MANAGER",
  )
  paymentReviewQueue(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.getPaymentReviewQueue(
      user,
    );
  }

  @Get(":transactionNumber/status")
  @UseGuards(JwtAuthGuard)
  paymentStatus(
    @Param("transactionNumber")
    transactionNumber: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.getMpesaPaymentStatus(
      transactionNumber,
      user,
    );
  }
}
