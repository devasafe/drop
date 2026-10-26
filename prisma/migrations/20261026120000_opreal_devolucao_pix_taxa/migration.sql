-- Arrependimento com motoboy (caso B, fase 2c): o cliente paga a corrida de volta por Pix na conta da loja.
ALTER TYPE "ReturnRequestStatus" ADD VALUE 'aguardando_pagamento';

ALTER TABLE "ReturnRequest" ADD COLUMN "feeAmount" DECIMAL(12,2);
ALTER TABLE "ReturnRequest" ADD COLUMN "feeAsaasPaymentId" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "feePixPayload" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "feePixImage" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "feePixExpiresAt" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "feePaidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ReturnRequest_feeAsaasPaymentId_key" ON "ReturnRequest"("feeAsaasPaymentId");
