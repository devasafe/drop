-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "storeRepliedAt" TIMESTAMP(3),
ADD COLUMN     "storeReply" VARCHAR(500);

-- CreateIndex
CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");
