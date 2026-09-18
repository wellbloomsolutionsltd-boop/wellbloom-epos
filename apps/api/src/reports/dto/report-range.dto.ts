import {
  IsDateString,
  IsOptional,
  IsString,
} from "class-validator";

export class ReportRangeDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
