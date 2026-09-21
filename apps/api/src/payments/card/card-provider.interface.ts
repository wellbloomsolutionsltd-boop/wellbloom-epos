export type CreateCardPaymentParams = {
  amount: number;
  currency: string;
  reference: string;

  callbackUrl?: string;
  returnUrl?: string;

  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
};

export type CreateCardPaymentResult = {
  providerRequestId: string;

  checkoutUrl?: string;

  rawResponse: unknown;
};

export interface CardProvider {
  createPayment(
    params: CreateCardPaymentParams,
  ): Promise<CreateCardPaymentResult>;

  verifyPayment(
    providerRequestId: string,
  ): Promise<{
    successful: boolean;

    amount?: number;

    externalReference?: string;

    rawResponse: unknown;
  }>;
}
