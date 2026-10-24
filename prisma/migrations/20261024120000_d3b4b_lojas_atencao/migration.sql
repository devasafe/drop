-- D3b-4b: "precisa de atenção" gravado na loja e índices da lista de lojas do admin (spec 8).
ALTER TABLE "Store" ADD COLUMN "needsAttention" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "attentionCheckedAt" TIMESTAMP(3);

CREATE INDEX "Store_needsAttention_name_id_idx" ON "Store"("needsAttention" DESC, "name", "id");
CREATE INDEX "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");

-- Preenchimento inicial com a regra de computeStoreAttention (src/services/adminAccounts/storeAttention.ts):
-- pausa do admin; recebimento com problema (direto: conta Asaas da loja diferente de 'valid'; custódia:
-- subconta com status 'error'); ou mais de 10% de cancelados/recusados em 30 dias com ao menos 5 pedidos.
-- O SQL não enxerga o PAYMENT_GATEWAY do env (custódia sem Asaas é "não se aplica"), então
-- "attentionCheckedAt" fica NULL: a primeira rodada do job (ao subir o servidor) recalcula todas com a
-- regra exata.
UPDATE "Store" AS s
SET "needsAttention" = (
  s."adminPausedAt" IS NOT NULL
  OR (cfg.mode = 'direto' AND EXISTS (
    SELECT 1 FROM "StoreAsaasAccount" a WHERE a."storeId" = s."id" AND a."status" <> 'valid'
  ))
  OR (cfg.mode <> 'direto' AND s."asaas"->>'status' = 'error')
  OR (
    SELECT CASE
      WHEN COUNT(*) >= 5
        THEN COUNT(*) FILTER (WHERE o."status" IN ('cancelado', 'rejeitado'))::numeric / COUNT(*) > 0.1
      ELSE false
    END
    FROM "Order" o
    WHERE o."storeId" = s."id" AND o."createdAt" >= NOW() - INTERVAL '30 days'
  )
)
FROM (
  SELECT COALESCE(
    (SELECT "settlementMode"::text FROM "PlatformConfig" ORDER BY "updatedAt" ASC LIMIT 1),
    'custodia'
  ) AS mode
) AS cfg;
