-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "cancelFeeCustomerPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "cancelFeeMotoboyPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "cancelFeeStorePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "customerAbsentWaitMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "poolTimeoutMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "storeAcceptTimeoutMin" INTEGER NOT NULL DEFAULT 10;
