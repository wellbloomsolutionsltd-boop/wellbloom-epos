import {
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

export class ReviewCashMovementDto {
  @IsIn([
    "APPROVED",
    "REJECTED",
  ])
  decision!:
    | "APPROVED"
    | "REJECTED";

  @IsOptional()
  @IsString()
  notes?: string;
}
