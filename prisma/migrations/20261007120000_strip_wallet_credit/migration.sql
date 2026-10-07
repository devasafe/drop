-- Segurança (2026-10-07): `wallet:credit` é exclusiva do CEO (via '*').
-- Remove a permissão de qualquer override persistido. Idempotente.
UPDATE "RolePermissions"
SET "permissions" = array_remove("permissions", 'wallet:credit')
WHERE 'wallet:credit' = ANY("permissions");
