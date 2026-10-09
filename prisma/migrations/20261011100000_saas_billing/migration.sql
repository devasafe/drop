-- CreateEnum
CREATE TYPE "SaasBillingStatus" AS ENUM ('trialing', 'active', 'past_due', 'paused', 'cancelled');

-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "saasGraceDays" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "saasMonthlyFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "saasTrialDays" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "StoreSaasBilling" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "SaasBillingStatus" NOT NULL DEFAULT 'trialing',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "paidUntil" TIMESTAMP(3),
    "customFee" DECIMAL(12,2),
    "asaasCustomerId" TEXT,
    "asaasSubscriptionId" TEXT,
    "overdueSince" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSaasBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaasBillingPayment" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaasBillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSaasBilling_storeId_key" ON "StoreSaasBilling"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSaasBilling_asaasSubscriptionId_key" ON "StoreSaasBilling"("asaasSubscriptionId");

-- CreateIndex
CREATE INDEX "StoreSaasBilling_status_idx" ON "StoreSaasBilling"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SaasBillingPayment_asaasPaymentId_key" ON "SaasBillingPayment"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "SaasBillingPayment_billingId_idx" ON "SaasBillingPayment"("billingId");

-- AddForeignKey
ALTER TABLE "StoreSaasBilling" ADD CONSTRAINT "StoreSaasBilling_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaasBillingPayment" ADD CONSTRAINT "SaasBillingPayment_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "StoreSaasBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;
