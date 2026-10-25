-- Reembolso de pedido entregue pedido pelo cliente (caso B). Só cria tabela e enums novos.
CREATE TYPE "ReturnReason" AS ENUM ('defeito', 'errado', 'arrependimento');
CREATE TYPE "ReturnRequestStatus" AS ENUM ('aguardando_loja', 'aprovado', 'recusado', 'devolvendo', 'concluido');
CREATE TYPE "ReturnMode" AS ENUM ('loja', 'motoboy');

CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "note" TEXT,
    "photoUrl" TEXT,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'aguardando_loja',
    "mode" "ReturnMode",
    "amount" DECIMAL(12,2) NOT NULL,
    "includesDeliveryFee" BOOLEAN NOT NULL,
    "rejectReasonCode" TEXT,
    "pin" TEXT,
    "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReturnRequest_orderId_key" ON "ReturnRequest"("orderId");
CREATE INDEX "ReturnRequest_storeId_status_idx" ON "ReturnRequest"("storeId", "status");
CREATE INDEX "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId");
