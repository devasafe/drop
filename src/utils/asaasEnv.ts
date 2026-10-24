import env from '../config/env';

/** Ambiente do Asaas em que o servidor opera, pela ASAAS_API_URL (sandbox por padrão). */
export function asaasServerEnvironment(): 'sandbox' | 'production' {
  return String(env.ASAAS_API_URL || '').includes('sandbox') ? 'sandbox' : 'production';
}
