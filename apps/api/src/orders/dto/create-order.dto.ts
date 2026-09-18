import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

import {
  Type,
} from "class-transformer";

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsIn([
    "DELIVERY",
    "PICKUP",
  ])
  fulfilmentMethod!:
    | "DELIVERY"
    | "PICKUP";

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
