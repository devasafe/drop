-- Adiciona 'wallet' como forma de pagamento (pagar 100% com saldo da carteira).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'wallet';
