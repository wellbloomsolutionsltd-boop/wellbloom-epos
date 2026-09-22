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
import { InitiateBankPaymentDto } from "./dto/initiate-bank-payment.dto";
import { InitiateCardDto } from "./dto/initiate-card.dto";
import { ReviewManualPaymentDto } from "./dto/review-manual-payment.dto";
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

  @Post("bank")
  @UseGuards(JwtAuthGuard)
  initiateBankPayment(
    @Body() dto: InitiateBankPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.initiateBankPayment(
      dto.orderId,
      dto.reference,
      user,
    );
  }

  @Post("card")
  @UseGuards(JwtAuthGuard)
  initiateCard(
    @Body() dto: InitiateCardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.initiateOrderCard(
      dto.orderId,
      user,
    );
  }

  @Post("bank/:id/review")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "ACCOUNTANT",
  )
  reviewBankPayment(
    @Param("id") id: string,
    @Body() dto: ReviewManualPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.reviewBankPayment(
      id,
      dto.decision,
      dto.reference,
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "ACCOUNTANT",
    "REPORT_VIEWER",
  )
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.findAll(user);
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

  @Get("review-required")
  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    "MANAGER",
    "TENANT_ADMIN",
    "SUPER_ADMIN",
    "ACCOUNTANT",
    "REPORT_VIEWER",
  )
  reviewRequired(
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
    return this.paymentsService.getPaymentStatus(
      transactionNumber,
      user,
    );
  }
}
