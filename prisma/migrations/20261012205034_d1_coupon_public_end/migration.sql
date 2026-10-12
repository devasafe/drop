-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;
