-- Freios de custo da gamificação (default: PAUSADO na fase grátis).
ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "benefitsRedeemEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "gamificationPointsEnabled" BOOLEAN NOT NULL DEFAULT false;
