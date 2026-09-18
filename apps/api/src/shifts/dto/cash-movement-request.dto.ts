import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";

export class CashMovementRequestDto {
  @IsIn([
    "CASH_IN",
    "CASH_OUT",
    "BANK_DROP",
  ])
  type!:
    | "CASH_IN"
    | "CASH_OUT"
    | "BANK_DROP";

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
