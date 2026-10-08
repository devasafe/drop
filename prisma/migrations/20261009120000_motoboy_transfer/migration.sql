-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN "directTransfersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "directTransferMaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 150,
ADD COLUMN "directTransferDailyMaxPerStore" DECIMAL(12,2) NOT NULL DEFAULT 3000;

-- CreateTable
CREATE TABLE "MotoboyTransfer" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "motoboyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'delivery',
    "amount" DECIMAL(12,2) NOT NULL,
    "pixKeyEncrypted" TEXT NOT NULL,
    "pixKeyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asaasTransferId" TEXT,
    "lastError" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotoboyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotoboyTransfer_deliveryId_key" ON "MotoboyTransfer"("deliveryId");

-- CreateIndex
CREATE INDEX "MotoboyTransfer_status_nextAttemptAt_idx" ON "MotoboyTransfer"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MotoboyTransfer_storeId_status_idx" ON "MotoboyTransfer"("storeId", "status");

-- CreateIndex
CREATE INDEX "MotoboyTransfer_motoboyId_createdAt_idx" ON "MotoboyTransfer"("motoboyId", "createdAt");
