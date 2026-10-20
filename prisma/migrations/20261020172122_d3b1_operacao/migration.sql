-- CreateEnum
CREATE TYPE "TransferPayer" AS ENUM ('store', 'platform');

-- CreateEnum
CREATE TYPE "CancellationFault" AS ENUM ('customer', 'store', 'motoboy', 'platform');

-- CreateEnum
CREATE TYPE "AdminOrderActionType" AS ENUM ('cancel', 'reassign');

-- AlterEnum
ALTER TYPE "AdminMoneyActionType" ADD VALUE 'order_admin_cancel';

-- AlterEnum
ALTER TYPE "AppCashboxSource" ADD VALUE 'admin_cancel_compensation';

-- AlterTable
ALTER TABLE "Cancellation" ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "faultParty" "CancellationFault";

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "excludedMotoboyIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MotoboyTransfer" ADD COLUMN     "payer" "TransferPayer" NOT NULL DEFAULT 'store';

-- CreateTable
CREATE TABLE "AdminOrderAction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" "AdminOrderActionType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "faultParty" "CancellationFault",
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOrderAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminOrderAction_orderId_createdAt_idx" ON "AdminOrderAction"("orderId", "createdAt");
