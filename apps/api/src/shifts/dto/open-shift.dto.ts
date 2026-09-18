import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class OpenShiftDto {
  @IsNumber()
  @Min(0)
  openingCash!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
