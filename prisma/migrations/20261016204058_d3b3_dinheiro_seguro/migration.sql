-- CreateEnum
CREATE TYPE "AdminMoneyActionType" AS ENUM ('payout_release', 'payout_block', 'payout_unblock', 'payout_mark_paid', 'payout_resolve_uncertain', 'withdrawal_approve', 'withdrawal_reject', 'withdrawal_resolve_uncertain', 'cashbox_deposit', 'cashbox_withdrawal_request', 'cashbox_withdrawal_approve', 'cashbox_withdrawal_reject', 'wallet_adjust', 'commission_sync', 'motoboy_transfer_retry', 'motoboy_transfer_resolve', 'direct_refund_resolve');

-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'releasing';

-- AlterEnum
ALTER TYPE "WalletEntryCategory" ADD VALUE 'adjustment';

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT,
ADD COLUMN     "uncertainAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "requestedBy" TEXT;

-- CreateTable
CREATE TABLE "AdminMoneyAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" "AdminMoneyActionType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminMoneyAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminMoneyAction_idempotencyKey_key" ON "AdminMoneyAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AdminMoneyAction_createdAt_idx" ON "AdminMoneyAction"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminMoneyAction_actorId_createdAt_idx" ON "AdminMoneyAction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminMoneyAction_type_createdAt_idx" ON "AdminMoneyAction"("type", "createdAt");
