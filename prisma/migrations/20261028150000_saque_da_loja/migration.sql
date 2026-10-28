-- CreateTable
CREATE TABLE "StoreWithdrawal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "pixKeyEncrypted" TEXT NOT NULL,
    "pixKeyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "asaasTransferId" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreWithdrawal_storeId_status_idx" ON "StoreWithdrawal"("storeId", "status");

-- CreateIndex
CREATE INDEX "StoreWithdrawal_storeId_createdAt_idx" ON "StoreWithdrawal"("storeId", "createdAt");
