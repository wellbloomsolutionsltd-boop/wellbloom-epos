import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import {
  Reflector,
} from "@nestjs/core";

import {
  ROLES_KEY,
} from "./roles.decorator";

import {
  AuthenticatedRequest,
} from "./jwt-auth.guard";

@Injectable()
export class RolesGuard
  implements CanActivate
{
  constructor(
    @Inject(Reflector)
    private readonly reflector:
      Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ) {
    const requiredRoles =
      this.reflector
        .getAllAndOverride<string[]>(
          ROLES_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    if (
      !requiredRoles ||
      requiredRoles.length === 0
    ) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const role =
      request.user?.role;

    if (
      !role ||
      !requiredRoles.includes(
        role,
      )
    ) {
      throw new ForbiddenException(
        "You do not have permission to perform this action",
      );
    }

    return true;
  }
}
