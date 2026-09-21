import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";

import {
  CardProvider,
} from "./card-provider.interface";

@Injectable()
export class CardService {
  constructor(
    private readonly provider:
      CardProvider,
  ) {}

  createPayment(params: {
    amount: number;
    currency: string;
    reference: string;

    customer?: {
      name?: string;
      email?: string;
      phone?: string;
    };
  }) {
    return this.provider.createPayment(
      params,
    );
  }

  async verifyPayment(
    providerRequestId: string,
  ) {
    if (!providerRequestId) {
      throw new BadRequestException(
        "Card provider request ID is required",
      );
    }

    return this.provider.verifyPayment(
      providerRequestId,
    );
  }
}
