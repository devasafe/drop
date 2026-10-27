-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "signalLostAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeliveryTrackPoint" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "motoboyId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTrackPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryTrackPoint_deliveryId_createdAt_idx" ON "DeliveryTrackPoint"("deliveryId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryTrackPoint_createdAt_idx" ON "DeliveryTrackPoint"("createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryTrackPoint" ADD CONSTRAINT "DeliveryTrackPoint_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
