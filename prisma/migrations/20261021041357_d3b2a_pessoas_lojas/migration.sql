-- CreateEnum
CREATE TYPE "AdminAccountActionType" AS ENUM ('block', 'unblock', 'roles_change', 'disconnect', 'debt_forgive', 'store_pause', 'store_unpause', 'note');

-- AlterEnum
ALTER TYPE "CustomerDebtStatus" ADD VALUE 'forgiven';

-- AlterTable
ALTER TABLE "CustomerDebt" ADD COLUMN     "forgivenAt" TIMESTAMP(3),
ADD COLUMN     "forgivenBy" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "adminPauseReason" TEXT,
ADD COLUMN     "adminPausedAt" TIMESTAMP(3),
ADD COLUMN     "adminPausedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAccountAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "userId" TEXT,
    "storeId" TEXT,
    "type" "AdminAccountActionType" NOT NULL,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccountAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAccountAction_userId_createdAt_idx" ON "AdminAccountAction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAccountAction_storeId_createdAt_idx" ON "AdminAccountAction"("storeId", "createdAt");


-- D3b-2a: exatamente um alvo por linha (pessoa OU loja). O service também garante.
ALTER TABLE "AdminAccountAction" ADD CONSTRAINT "AdminAccountAction_one_target_check" CHECK (("userId" IS NULL) <> ("storeId" IS NULL));
