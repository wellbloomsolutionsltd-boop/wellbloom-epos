import {
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

export class ReviewManualPaymentDto {
  @IsIn([
    "APPROVED",
    "REJECTED",
  ])
  decision!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
