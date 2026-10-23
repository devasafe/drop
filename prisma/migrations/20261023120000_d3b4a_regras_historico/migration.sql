-- D3b-4a: histórico de regras e repasse do motoboy no direto travado em 100%.
CREATE TYPE "PlatformRuleSource" AS ENUM ('rules', 'switches');

CREATE TABLE "PlatformRuleChange" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" "PlatformRuleSource" NOT NULL,
    "field" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformRuleChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformRuleChange_createdAt_idx" ON "PlatformRuleChange"("createdAt" DESC);
CREATE INDEX "PlatformRuleChange_field_createdAt_idx" ON "PlatformRuleChange"("field", "createdAt");
CREATE INDEX "PlatformRuleChange_actorId_createdAt_idx" ON "PlatformRuleChange"("actorId", "createdAt");

-- Decisão do usuário (22/10): no modo direto o motoboy fica com 100% do frete.
UPDATE "PlatformConfig" SET "motoboyShareDirect" = 100 WHERE "motoboyShareDirect" <> 100;
