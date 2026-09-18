import "dotenv/config";
import * as bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: {
      code: "WELLBLOOM",
    },

    update: {},

    create: {
      name: "WELLBLOOM SOLUTIONS LIMITED",
      code: "WELLBLOOM",
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "MAIN",
      },
    },

    update: {},

    create: {
      name: "Main Branch",
      code: "MAIN",
      tenantId: tenant.id,
    },
  });

  const passwordHash =
    await bcrypt.hash(
      "ChangeMe123!",
      12,
    );

  const adminUser =
    await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email:
            "admin@wellbloom.local",
        },
      },

      update: {},

      create: {
        firstName: "System",
        lastName: "Administrator",

        email:
          "admin@wellbloom.local",

        passwordHash,

        role: "TENANT_ADMIN",

        tenantId: tenant.id,
        branchId: branch.id,

        isActive: true,
      },
    });

  console.log(
    "Administrator created:",
    adminUser.email,
  );

  const product = await prisma.product.upsert({
    where: {
      tenantId_sku: {
        tenantId: tenant.id,
        sku: "MAG-001",
      },
    },

    update: {},

    create: {
      name: "MAGNESIUM TABLETS",
      sku: "MAG-001",
      barcode: "6161102222222",
      sellingPrice: 3500,
      costPrice: 2500,
      tenantId: tenant.id,
    },
  });

  const inventory = await prisma.inventory.upsert({
    where: {
      branchId_productId: {
        branchId: branch.id,
        productId: product.id,
      },
    },

    update: {},

    create: {
      branchId: branch.id,
      productId: product.id,
      quantity: 25,
      reservedQty: 0,
      reorderLevel: 8,
      minimumStock: 8,
      maximumStock: 50,
    },
  });

  console.log("Tenant created:");
  console.log(tenant);

  console.log("Branch created:");
  console.log(branch);

  console.log("Product created:");
  console.log(product);

  console.log("Inventory created:");
  console.log(inventory);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
