import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";

@Injectable()
export class MpesaService {
  private getConfig() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const oauthUrl = process.env.MPESA_OAUTH_URL;
    const stkPushUrl = process.env.MPESA_STK_PUSH_URL;
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (
      !consumerKey ||
      !consumerSecret ||
      !oauthUrl ||
      !stkPushUrl ||
      !shortcode ||
      !passkey ||
      !callbackUrl
    ) {
      throw new InternalServerErrorException(
        "M-Pesa configuration is incomplete",
      );
    }

    return {
      consumerKey,
      consumerSecret,
      oauthUrl,
      stkPushUrl,
      shortcode,
      passkey,
      callbackUrl,
    };
  }

  private timestamp() {
    const now = new Date();
    const pad = (value: number) =>
      String(value).padStart(2, "0");

    return (
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    );
  }

  normalizePhone(input: string) {
    let phone = input
      .replace(/\s+/g, "")
      .replace(/-/g, "");

    if (phone.startsWith("+254")) {
      phone = phone.slice(1);
    }

    if (phone.startsWith("0")) {
      phone = `254${phone.slice(1)}`;
    }

    if (!/^254\d{9}$/.test(phone)) {
      throw new Error("Invalid Kenyan phone number");
    }

    return phone;
  }

  async getAccessToken() {
    const config = this.getConfig();
    const credentials = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`,
    ).toString("base64");

    const response = await fetch(config.oauthUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        "Unable to authenticate with M-Pesa",
      );
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new InternalServerErrorException(
        "M-Pesa authentication returned no access token",
      );
    }

    return data.access_token as string;
  }

  async initiateStkPush(params: {
    phone: string;
    amount: number;
    accountReference: string;
    description: string;
  }) {
    const config = this.getConfig();
    const phone = this.normalizePhone(params.phone);
    const token = await this.getAccessToken();
    const timestamp = this.timestamp();
    const password = Buffer.from(
      `${config.shortcode}${config.passkey}${timestamp}`,
    ).toString("base64");

    const response = await fetch(config.stkPushUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(params.amount),
        PartyA: phone,
        PartyB: config.shortcode,
        PhoneNumber: phone,
        CallBackURL: config.callbackUrl,
        AccountReference: params.accountReference,
        TransactionDesc: params.description,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new InternalServerErrorException({
        message: "M-Pesa STK request failed",
        darajaResponse: data,
      });
    }

    return data;
  }
}
