import {
  IsOptional,
  IsString,
} from "class-validator";

export class CloseEndOfDayDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
