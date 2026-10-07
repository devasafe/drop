-- CreateTable
CREATE TABLE "StoreAsaasAudit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "apiKeyLast4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAsaasAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreAsaasAudit_storeId_idx" ON "StoreAsaasAudit"("storeId");
