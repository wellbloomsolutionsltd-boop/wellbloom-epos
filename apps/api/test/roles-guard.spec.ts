import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../src/auth/roles.guard";
import { ROLES_KEY } from "../src/auth/roles.decorator";

function createContext(
  role: string | undefined,
  requiredRoles: string[],
) {
  const handler = () => undefined;
  const target = class {};

  Reflect.defineMetadata(
    ROLES_KEY,
    requiredRoles,
    handler,
  );

  return {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({
      getRequest: () => ({
        user: role
          ? { role }
          : undefined,
      }),
    }),
  } as any;
}

test("cashier is rejected from a manager-only action", () => {
  const guard = new RolesGuard(new Reflector());
  const context = createContext("CASHIER", [
    "MANAGER",
    "TENANT_ADMIN",
  ]);

  assert.throws(
    () => guard.canActivate(context),
    ForbiddenException,
  );
});

test("manager is accepted for an authorized action", () => {
  const guard = new RolesGuard(new Reflector());
  const context = createContext("MANAGER", [
    "MANAGER",
    "TENANT_ADMIN",
  ]);

  assert.equal(guard.canActivate(context), true);
});

test("unauthenticated request is rejected from a restricted action", () => {
  const guard = new RolesGuard(new Reflector());
  const context = createContext(undefined, [
    "MANAGER",
  ]);

  assert.throws(
    () => guard.canActivate(context),
    ForbiddenException,
  );
});

test("actions without declared roles are open to any authenticated role", () => {
  const guard = new RolesGuard(new Reflector());
  const context = createContext("CASHIER", []);

  assert.equal(guard.canActivate(context), true);
});
