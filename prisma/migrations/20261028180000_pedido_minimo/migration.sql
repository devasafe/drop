-- Pedido mínimo (só produtos): da plataforma (padrão R$ 5) e, opcional, da loja (nunca abaixo).
ALTER TABLE "PlatformConfig" ADD COLUMN "minOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 5;
ALTER TABLE "Store" ADD COLUMN "minOrderValue" DECIMAL(12,2);
