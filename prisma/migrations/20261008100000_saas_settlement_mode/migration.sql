-- Modo SaaS por loja: configuracao de liquidacao/cobranca e modo de entrega da loja.
CREATE TYPE "SettlementMode" AS ENUM ('custodia', 'direto');
CREATE TYPE "BillingModel" AS ENUM ('mensalidade', 'comissao', 'ambos');
CREATE TYPE "StoreDeliveryMode" AS ENUM ('propria', 'pool_drop');

ALTER TABLE "PlatformConfig"
  ADD COLUMN "settlementMode" "SettlementMode" NOT NULL DEFAULT 'custodia',
  ADD COLUMN "billingModel" "BillingModel" NOT NULL DEFAULT 'mensalidade',
  ADD COLUMN "motoboyShareDirect" DECIMAL(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN "directCardEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transferBlockHours" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "Store"
  ADD COLUMN "deliveryMode" "StoreDeliveryMode" NOT NULL DEFAULT 'pool_drop',
  ADD COLUMN "showInMarketplace" BOOLEAN NOT NULL DEFAULT true;
