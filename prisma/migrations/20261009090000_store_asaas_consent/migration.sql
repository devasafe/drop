-- CreateTable
CREATE TABLE "StoreAsaasConsent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAsaasConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreAsaasConsent_storeId_acceptedAt_idx" ON "StoreAsaasConsent"("storeId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "StoreAsaasConsent" ADD CONSTRAINT "StoreAsaasConsent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
