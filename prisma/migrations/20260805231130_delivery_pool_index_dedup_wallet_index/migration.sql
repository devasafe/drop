-- DropIndex
DROP INDEX "Delivery_status_idx";

-- DropIndex
DROP INDEX "Wallet_owner_ownerType_idx";

-- CreateIndex
CREATE INDEX "Delivery_status_motoboyId_idx" ON "Delivery"("status", "motoboyId");
