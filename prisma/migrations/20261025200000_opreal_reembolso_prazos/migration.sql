-- Prazos do reembolso de pedido entregue (caso B) em Regras e taxas.
ALTER TABLE "PlatformConfig" ADD COLUMN "returnFullRefundDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "PlatformConfig" ADD COLUMN "returnStoreResponseHours" INTEGER NOT NULL DEFAULT 48;
