-- Um aceite por versão por loja (aceitar de novo a mesma versão é idempotente).
-- Duplicatas antigas (reconexões antes desta regra): fica o PRIMEIRO aceite de cada
-- (storeId, termsVersion). O trigger de imutabilidade é desligado só para essa limpeza.
ALTER TABLE "StoreAsaasConsent" DISABLE TRIGGER store_asaas_consent_no_update_delete;

DELETE FROM "StoreAsaasConsent" c
USING "StoreAsaasConsent" d
WHERE c."storeId" = d."storeId"
  AND c."termsVersion" = d."termsVersion"
  AND (c."acceptedAt", c."id") > (d."acceptedAt", d."id");

ALTER TABLE "StoreAsaasConsent" ENABLE TRIGGER store_asaas_consent_no_update_delete;

-- CreateIndex
CREATE UNIQUE INDEX "StoreAsaasConsent_storeId_termsVersion_key" ON "StoreAsaasConsent"("storeId", "termsVersion");
