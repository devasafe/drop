-- AlterTable
ALTER TABLE "Store" ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "pausedUntil" TIMESTAMP(3),
ADD COLUMN "tagline" VARCHAR(80);
