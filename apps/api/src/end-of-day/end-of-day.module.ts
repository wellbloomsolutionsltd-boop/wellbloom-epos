import {
  Module,
} from "@nestjs/common";

import {
  EndOfDayController,
} from "./end-of-day.controller";

import {
  EndOfDayService,
} from "./end-of-day.service";

@Module({
  controllers: [
    EndOfDayController,
  ],

  providers: [
    EndOfDayService,
  ],
})
export class EndOfDayModule {}
