-- Duração da rota (segundos) calculada pelo RouteService e gravada no pedido.
-- Coluna simples e segura (roda no `prisma migrate deploy` automático do deploy).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryDuration" INTEGER;
