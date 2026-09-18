import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CashMovementDto {
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

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
