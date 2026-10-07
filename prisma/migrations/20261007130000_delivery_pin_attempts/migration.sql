-- Trava de força bruta dos PINs da entrega (retirada, entrega e devolução).
ALTER TABLE "Delivery" ADD COLUMN "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Delivery" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
