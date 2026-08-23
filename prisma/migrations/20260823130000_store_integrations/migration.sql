-- Integração de estoque da loja: chaves de API (pull) + webhooks (push).
-- Só cria tabelas novas (seguro no `prisma migrate deploy` automático do deploy).

-- CreateTable
CREATE TABLE "StoreApiKey" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreWebhook" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastStatus" INTEGER,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreApiKey_prefix_key" ON "StoreApiKey"("prefix");

-- CreateIndex
CREATE INDEX "StoreApiKey_storeId_idx" ON "StoreApiKey"("storeId");

-- CreateIndex
CREATE INDEX "StoreWebhook_storeId_idx" ON "StoreWebhook"("storeId");

-- AddForeignKey
ALTER TABLE "StoreApiKey" ADD CONSTRAINT "StoreApiKey_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreWebhook" ADD CONSTRAINT "StoreWebhook_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
