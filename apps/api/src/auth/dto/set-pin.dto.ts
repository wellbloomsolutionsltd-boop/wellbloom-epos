import {
  IsNotEmpty,
  IsString,
  Matches,
} from "class-validator";

export class SetPinDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @Matches(/^\d{4,8}$/, {
    message: "PIN must contain 4 to 8 digits",
  })
  pin!: string;
}
