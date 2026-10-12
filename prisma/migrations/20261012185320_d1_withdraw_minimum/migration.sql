-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "storeMinimumWithdraw" DECIMAL(12,2) NOT NULL DEFAULT 10,
ALTER COLUMN "motoboyMinimumWithdraw" SET DEFAULT 10;

-- D1: o mínimo do motoboy que nunca foi editado (ainda no default antigo, 50) passa a 10.
-- Quem já mudou o valor no admin mantém o que escolheu.
UPDATE "PlatformConfig" SET "motoboyMinimumWithdraw" = 10 WHERE "motoboyMinimumWithdraw" = 50;
