-- Fix round 1 (R27): resolução manual de saque incerto.
ALTER TABLE "WithdrawalRequest" ADD COLUMN "resolvedBy" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolutionNote" TEXT;
