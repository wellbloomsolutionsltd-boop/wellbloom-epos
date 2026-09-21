import {
  IsNotEmpty,
  IsString,
} from "class-validator";

export class InitiateMpesaDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}
