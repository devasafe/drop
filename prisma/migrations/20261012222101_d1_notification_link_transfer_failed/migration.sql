-- AlterTable
ALTER TABLE "MotoboyTransfer" ADD COLUMN     "firstFailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "link" TEXT;
