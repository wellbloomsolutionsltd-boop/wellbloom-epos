-- CreateEnum
CREATE TYPE "PriceChannel" AS ENUM ('POS', 'ECOMMERCE');

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT,
    "channel" "PriceChannel" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPrice_tenantId_idx" ON "ProductPrice"("tenantId");
CREATE INDEX "ProductPrice_productId_idx" ON "ProductPrice"("productId");
CREATE INDEX "ProductPrice_branchId_idx" ON "ProductPrice"("branchId");
CREATE INDEX "ProductPrice_channel_idx" ON "ProductPrice"("channel");
CREATE INDEX "ProductPrice_isActive_idx" ON "ProductPrice"("isActive");
CREATE INDEX "ProductPrice_startsAt_idx" ON "ProductPrice"("startsAt");
CREATE INDEX "ProductPrice_endsAt_idx" ON "ProductPrice"("endsAt");

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
