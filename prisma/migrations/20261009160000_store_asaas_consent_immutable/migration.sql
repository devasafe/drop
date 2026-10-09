-- Prova do aceite do termo do lojista (StoreAsaasConsent) é imutável:
-- 1) a FK deixa de apagar em cascata com a loja (RESTRICT);
-- 2) trigger recusa UPDATE, DELETE e TRUNCATE — a tabela só aceita INSERT.
-- Limpeza de teste contorna de forma explícita com SET LOCAL session_replication_role = replica
-- (exige superusuário; ver src/tests/helpers/pgCleanup.ts).

-- DropForeignKey
ALTER TABLE "StoreAsaasConsent" DROP CONSTRAINT "StoreAsaasConsent_storeId_fkey";

-- AddForeignKey
ALTER TABLE "StoreAsaasConsent" ADD CONSTRAINT "StoreAsaasConsent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION store_asaas_consent_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StoreAsaasConsent é imutável: só INSERT (% recusado)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER store_asaas_consent_no_update_delete
  BEFORE UPDATE OR DELETE ON "StoreAsaasConsent"
  FOR EACH ROW EXECUTE FUNCTION store_asaas_consent_immutable();

CREATE TRIGGER store_asaas_consent_no_truncate
  BEFORE TRUNCATE ON "StoreAsaasConsent"
  FOR EACH STATEMENT EXECUTE FUNCTION store_asaas_consent_immutable();
