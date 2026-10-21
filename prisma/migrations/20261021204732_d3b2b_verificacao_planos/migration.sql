-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAccountActionType" ADD VALUE 'verification_decision';
ALTER TYPE "AdminAccountActionType" ADD VALUE 'trial_extend';
ALTER TYPE "AdminAccountActionType" ADD VALUE 'saas_cancel';
ALTER TYPE "AdminAccountActionType" ADD VALUE 'plan_reject';

-- AlterTable
ALTER TABLE "StoreSaasBilling" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT;

-- AlterTable
ALTER TABLE "StoreSubscription" ADD COLUMN     "requestReason" TEXT;

-- CreateIndex
CREATE INDEX "AdminAccountAction_type_createdAt_idx" ON "AdminAccountAction"("type", "createdAt");
