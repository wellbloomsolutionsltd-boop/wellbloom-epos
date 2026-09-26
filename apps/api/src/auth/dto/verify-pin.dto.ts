import {
  IsString,
  Matches,
} from "class-validator";

export class VerifyPinDto {
  @IsString()
  @Matches(/^\d{4,8}$/, {
    message: "PIN must contain 4 to 8 digits",
  })
  pin!: string;
}
