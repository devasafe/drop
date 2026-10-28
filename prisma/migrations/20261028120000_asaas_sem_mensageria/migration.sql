-- Customers já criados na conta da loja nasceram com os avisos do Asaas ligados.
ALTER TABLE "StoreAsaasCustomer" ADD COLUMN "notificationsOff" BOOLEAN NOT NULL DEFAULT false;
