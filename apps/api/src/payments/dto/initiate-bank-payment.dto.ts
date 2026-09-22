import {
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class InitiateBankPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
