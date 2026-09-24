import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";

const TENANT_WIDE_BRANCH_ROLES = new Set([
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "MANAGER",
]);

const INACCESSIBLE_BRANCH_ID = "__NO_AUTHORIZED_BRANCH__";

type BranchClient = Pick<
  Prisma.TransactionClient,
  "branch"
>;

export function hasTenantWideBranchAccess(
  user: AuthenticatedUser,
) {
  return TENANT_WIDE_BRANCH_ROLES.has(user.role);
}

export function getBranchScope(
  user: AuthenticatedUser,
) {
  if (hasTenantWideBranchAccess(user)) {
    return undefined;
  }

  return user.branchId ?? INACCESSIBLE_BRANCH_ID;
}

export async function assertBranchAccess(
  db: BranchClient,
  user: AuthenticatedUser,
  branchId: string,
) {
  if (
    !hasTenantWideBranchAccess(user) &&
    user.branchId !== branchId
  ) {
    throw new NotFoundException("Branch not found");
  }

  const branch = await db.branch.findFirst({
    where: {
      id: branchId,
      tenantId: user.tenantId,
    },
  });

  if (!branch) {
    throw new NotFoundException("Branch not found");
  }

  return branch;
}

export async function resolveBranchScope(
  db: BranchClient,
  user: AuthenticatedUser,
  requestedBranchId?: string,
) {
  if (requestedBranchId) {
    const branch = await assertBranchAccess(
      db,
      user,
      requestedBranchId,
    );
    return branch.id;
  }

  return getBranchScope(user);
}
