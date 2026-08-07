-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "installmentCount" INTEGER;

-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "cardAnticipationMonthlyRate" DECIMAL(5,2) NOT NULL DEFAULT 1.99,
ADD COLUMN     "cardFeeFixed" DECIMAL(12,2) NOT NULL DEFAULT 0.49,
ADD COLUMN     "cardFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 2.99,
ADD COLUMN     "cardInstallmentMaxCount" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "cardInstallmentMinValue" DECIMAL(12,2) NOT NULL DEFAULT 5;
