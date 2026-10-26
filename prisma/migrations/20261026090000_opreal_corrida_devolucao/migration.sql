-- Corrida de devolução (caso B, fase 2b): tipo da corrida e o pedido de reembolso dela.
CREATE TYPE "DeliveryKind" AS ENUM ('entrega', 'devolucao');

ALTER TABLE "Delivery" ADD COLUMN "kind" "DeliveryKind" NOT NULL DEFAULT 'entrega';
ALTER TABLE "Delivery" ADD COLUMN "returnRequestId" TEXT;

CREATE INDEX "Delivery_returnRequestId_idx" ON "Delivery"("returnRequestId");
