import {
  Injectable,
  NestMiddleware,
} from "@nestjs/common";

import {
  randomUUID,
} from "node:crypto";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

export type RequestWithId =
  Request & {
    requestId?: string;
  };

@Injectable()
export class RequestIdMiddleware
  implements NestMiddleware
{
  use(
    req: RequestWithId,
    res: Response,
    next: NextFunction,
  ) {
    const incoming =
      req.header(
        "x-request-id",
      );

    const requestId =
      incoming?.trim() ||
      randomUUID();

    req.requestId =
      requestId;

    res.setHeader(
      "x-request-id",
      requestId,
    );

    next();
  }
}
