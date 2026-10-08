-- AlterTable
ALTER TABLE "MotoboyTransfer" ADD COLUMN "previousAsaasTransferIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
