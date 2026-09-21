import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class SetProductPriceDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsIn(["POS", "ECOMMERCE"])
  channel!: "POS" | "ECOMMERCE";

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
