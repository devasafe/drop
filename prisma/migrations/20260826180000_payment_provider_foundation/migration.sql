-- Enum de provedor de pagamento
CREATE TYPE "PaymentProviderName" AS ENUM ('asaas', 'mercadopago');

-- Config global: qual provedor os pedidos NOVOS usam
ALTER TABLE "PlatformConfig"
  ADD COLUMN "paymentProvider" "PaymentProviderName" NOT NULL DEFAULT 'asaas';

-- Carimbo por pedido: pedidos existentes nasceram no Asaas
ALTER TABLE "Order"
  ADD COLUMN "paymentProvider" "PaymentProviderName" NOT NULL DEFAULT 'asaas';
