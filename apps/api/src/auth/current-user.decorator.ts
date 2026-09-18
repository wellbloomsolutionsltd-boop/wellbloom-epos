import {
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "./jwt-auth.guard";

export const CurrentUser =
  createParamDecorator(
    (
      _data: unknown,
      context: ExecutionContext,
    ): AuthenticatedUser => {
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();

      if (!request.user) {
        throw new Error(
          "Authenticated user missing",
        );
      }

      return request.user;
    },
  );
