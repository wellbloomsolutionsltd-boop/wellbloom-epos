import {
  IsNotEmpty,
  IsString,
} from "class-validator";

export class InitiateCardDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}
