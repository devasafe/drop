import type { IPaymentProvider } from './types';
import { AsaasProvider } from './asaasProvider';
import { AsaasLojaProvider } from './asaasLojaProvider';
import { getActivePaymentProviderName, type PaymentProviderName } from './activeProvider';

export function getPaymentProvider(name: PaymentProviderName = 'asaas'): IPaymentProvider {
  switch (name) {
    case 'asaas':
      return new AsaasProvider();
    case 'asaas_loja':
      // Modo SaaS "direto": cobra na conta Asaas da própria loja.
      return new AsaasLojaProvider();
    case 'mercadopago':
      // Registrado no Plano 2. Enquanto isso, selecionar MP é erro explícito.
      throw new Error('Provedor de pagamento "mercadopago" ainda não implementado');
    default:
      throw new Error(`Provedor de pagamento "${name}" não implementado`);
  }
}

/** Provedor ativo para pedidos NOVOS (lê o PlatformConfig). */
export async function getActivePaymentProvider(): Promise<IPaymentProvider> {
  return getPaymentProvider(await getActivePaymentProviderName());
}

export * from './types';
export { getActivePaymentProviderName };
