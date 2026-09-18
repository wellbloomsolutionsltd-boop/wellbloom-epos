import {
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

export class ReviewReturnDto {
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
