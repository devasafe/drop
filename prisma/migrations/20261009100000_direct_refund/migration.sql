-- CreateTable
CREATE TABLE "DirectRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "cancellationId" TEXT,
    "storeId" TEXT NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "requestedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectRefund_orderId_key" ON "DirectRefund"("orderId");

-- CreateIndex
CREATE INDEX "DirectRefund_status_nextAttemptAt_idx" ON "DirectRefund"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DirectRefund_storeId_status_idx" ON "DirectRefund"("storeId", "status");
