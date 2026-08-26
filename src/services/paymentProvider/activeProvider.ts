import { prisma } from '../../lib/prisma';

export type PaymentProviderName = 'asaas' | 'mercadopago';

/**
 * Provedor de pagamento ativo para pedidos NOVOS. Fonte da verdade é o
 * PlatformConfig (controlado no admin); se não houver registro, cai para
 * 'asaas' (env.PAYMENT_GATEWAY hoje só distingue 'none' | 'asaas', então o
 * fallback é sempre 'asaas').
 */
export async function getActivePaymentProviderName(): Promise<PaymentProviderName> {
  const cfg = await prisma.platformConfig.findFirst();
  if (cfg?.paymentProvider) return cfg.paymentProvider as PaymentProviderName;
  return 'asaas';
}
