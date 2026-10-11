-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "pickedAt" TIMESTAMP(3);
