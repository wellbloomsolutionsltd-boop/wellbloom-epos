import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

import {
  Type,
} from "class-transformer";

export class ReturnItemDto {
  @IsString()
  @IsNotEmpty()
  saleItemId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreateReturnDto {
  @IsString()
  @IsNotEmpty()
  saleId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsIn([
    "CASH",
    "MPESA",
    "CARD",
    "BANK",
    "INSURANCE",
    "STORE_CREDIT",
    "OTHER",
  ])
  refundMethod!:
    | "CASH"
    | "MPESA"
    | "CARD"
    | "BANK"
    | "INSURANCE"
    | "STORE_CREDIT"
    | "OTHER";

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}
