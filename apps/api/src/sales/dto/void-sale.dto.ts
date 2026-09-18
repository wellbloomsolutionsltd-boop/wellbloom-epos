import {
  IsNotEmpty,
  IsString,
  MinLength,
} from "class-validator";

export class VoidSaleDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}
