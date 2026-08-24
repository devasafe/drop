-- Escopos da API key (least-privilege): 'read' e/ou 'write'. Aditivo e seguro
-- no `prisma migrate deploy` automático. Chaves existentes ficam com read+write.
ALTER TABLE "StoreApiKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['read', 'write']::TEXT[];
