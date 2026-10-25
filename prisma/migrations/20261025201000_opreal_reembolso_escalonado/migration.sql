-- Reembolso sem resposta da loja no prazo: avisado ao admin uma vez.
ALTER TABLE "ReturnRequest" ADD COLUMN "escalatedAt" TIMESTAMP(3);
