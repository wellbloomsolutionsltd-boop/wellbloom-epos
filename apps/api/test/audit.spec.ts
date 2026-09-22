import assert from "node:assert/strict";
import test from "node:test";
import { AuditService } from "../src/audit/audit.service";

test("create writes a general audit log without secret fields", async () => {
  const writes: any[] = [];
  const prisma: any = {
    auditLog: {
      create: async (args: any) => {
        writes.push(args);
        return {
          id: "audit-1",
          ...args.data,
        };
      },
    },
  };
  const service = new AuditService(prisma);

  const result = await service.create({
    tenantId: "tenant-1",
    userId: "user-1",
    action: "SHIFT_OPENED",
    entityType: "SHIFT",
    entityId: "shift-1",
    requestId: "request-1",
    metadata: {
      branchId: "branch-1",
    },
  });

  assert.equal(result.id, "audit-1");
  assert.deepEqual(writes[0].data, {
    tenantId: "tenant-1",
    userId: "user-1",
    action: "SHIFT_OPENED",
    entityType: "SHIFT",
    entityId: "shift-1",
    requestId: "request-1",
    metadata: {
      branchId: "branch-1",
    },
  });
  assert.equal(
    "token" in writes[0].data,
    false,
  );
});

test("createWithTx uses the supplied transaction client", async () => {
  let rootWrites = 0;
  let transactionWrites = 0;
  const service = new AuditService({
    auditLog: {
      create: async () => {
        rootWrites++;
      },
    },
  } as any);
  const tx: any = {
    auditLog: {
      create: async ({ data }: any) => {
        transactionWrites++;
        return {
          id: "audit-2",
          ...data,
        };
      },
    },
  };

  await service.createWithTx(tx, {
    action: "SALE_VOIDED",
    entityType: "SALE",
    entityId: "sale-1",
  });

  assert.equal(rootWrites, 0);
  assert.equal(transactionWrites, 1);
});
