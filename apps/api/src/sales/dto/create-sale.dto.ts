import {
	ArrayMinSize,
	IsArray,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Min,
	ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateSaleItemDto {
	@IsString()
	@IsNotEmpty()
	productId!: string;

	@IsNumber()
	@Min(0.001)
	quantity!: number;
}

export class CreatePaymentDto {
	@IsIn([
		"CASH",
		"MPESA",
		"CARD",
		"BANK",
		"INSURANCE",
		"OTHER",
	])
	method!:
		| "CASH"
		| "MPESA"
		| "CARD"
		| "BANK"
		| "INSURANCE"
		| "OTHER";

	@IsNumber()
	@Min(0)
	amount!: number;

	@IsOptional()
	@IsString()
	reference?: string;
}

export class CreateSaleDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateSaleItemDto)
	items!: CreateSaleItemDto[];

	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreatePaymentDto)
	payments!: CreatePaymentDto[];

	@IsOptional()
	@IsNumber()
	@Min(0)
	discount?: number;
}
