import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  Prisma,
} from "@prisma/client";
import {
  PrismaService,
} from "../prisma/prisma.service";

export type CreateAuditLogInput = {
  tenantId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
  ) {}

  create(input: CreateAuditLogInput) {
    return this.createWithTx(
      this.prisma,
      input,
    );
  }

  createWithTx(
    tx: Pick<
      Prisma.TransactionClient,
      "auditLog"
    >,
    input: CreateAuditLogInput,
  ) {
    return tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        metadata: input.metadata,
      },
    });
  }
}
