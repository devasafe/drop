-- Corrida de devolução: o motoboy não encontrou o cliente na retirada.
ALTER TABLE "ReturnRequest" ADD COLUMN "pickupMissedAt" TIMESTAMP(3);
