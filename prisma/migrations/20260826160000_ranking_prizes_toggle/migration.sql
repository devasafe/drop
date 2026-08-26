-- Pausa/ativa a distribuição de prêmios do ranking (default: PAUSADO no início grátis).
ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "rankingPrizesEnabled" BOOLEAN NOT NULL DEFAULT false;
