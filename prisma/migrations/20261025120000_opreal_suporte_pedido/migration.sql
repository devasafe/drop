-- Chamado de suporte com o pedido (opcional, sem FK).
ALTER TABLE "SupportTicket" ADD COLUMN "orderId" TEXT;

CREATE INDEX "SupportTicket_orderId_idx" ON "SupportTicket"("orderId");
