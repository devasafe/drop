-- Lote pré-deploy 2 (A): marca de resposta incerta do gateway no saque.
ALTER TABLE "WithdrawalRequest" ADD COLUMN "uncertainAt" TIMESTAMP(3);
