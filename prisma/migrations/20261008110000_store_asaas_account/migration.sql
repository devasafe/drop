-- CreateTable
CREATE TABLE "StoreAsaasAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiKeyLast4" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "walletId" TEXT,
    "paymentWebhookId" TEXT,
    "paymentWebhookTokenHash" TEXT,
    "authWebhookTokenHash" TEXT,
    "ipWhitelistConfirmedAt" TIMESTAMP(3),
    "authWebhookConfirmedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreAsaasAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAsaasCustomer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAsaasCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreAsaasAccount_storeId_key" ON "StoreAsaasAccount"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreAsaasCustomer_storeId_userId_key" ON "StoreAsaasCustomer"("storeId", "userId");

-- AddForeignKey
ALTER TABLE "StoreAsaasAccount" ADD CONSTRAINT "StoreAsaasAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
