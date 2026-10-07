import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { encryptSensitiveData, decryptSensitiveData } from '../../utils/encryption';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';

/**
 * Conta Asaas própria da loja (modo SaaS "direto").
 * A chave NUNCA é logada nem vai em mensagem de erro/resposta.
 */

export type StoreAsaasStatus = {
  status: 'none' | 'valid' | 'invalid';
  environment: 'sandbox' | 'production' | null;
  lastCheckedAt: string | null;
  walletId: string | null;
  /** Final da chave (••••1234), único pedaço dela que sai do backend. */
  apiKeyLast4: string | null;
  checklist: { apiKey: boolean; paymentWebhook: boolean; ipWhitelistConfirmed: boolean; authWebhookConfirmed: boolean };
};

export class StoreAsaasNotReadyError extends AppError {
  constructor() {
    super('Conta Asaas da loja não está conectada ou é inválida', 409, true, 'STORE_ASAAS_NOT_READY');
    Object.setPrototypeOf(this, StoreAsaasNotReadyError.prototype);
  }
}

function serverEnvironment(): 'sandbox' | 'production' {
  return String(env.ASAAS_API_URL || '').includes('sandbox') ? 'sandbox' : 'production';
}

function toStatus(row: any | null): StoreAsaasStatus {
  if (!row) {
    return {
      status: 'none', environment: null, lastCheckedAt: null, walletId: null, apiKeyLast4: null,
      checklist: { apiKey: false, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false },
    };
  }
  return {
    status: row.status === 'valid' ? 'valid' : 'invalid',
    environment: row.environment as 'sandbox' | 'production',
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    walletId: row.walletId ?? null,
    apiKeyLast4: row.apiKeyLast4 ?? null,
    checklist: {
      apiKey: row.status === 'valid',
      paymentWebhook: !!row.paymentWebhookId,
      ipWhitelistConfirmed: !!row.ipWhitelistConfirmedAt,
      authWebhookConfirmed: !!row.authWebhookConfirmedAt,
    },
  };
}

export async function getStoreAsaasStatus(storeId: string): Promise<StoreAsaasStatus> {
  return toStatus(await prisma.storeAsaasAccount.findUnique({ where: { storeId } }));
}

export async function connectStoreAsaas(storeId: string, rawApiKey: string): Promise<StoreAsaasStatus> {
  const key = String(rawApiKey || '').trim();
  let keyEnv: 'sandbox' | 'production';
  if (key.startsWith('$aact_hmlg_')) keyEnv = 'sandbox';
  else if (key.startsWith('$aact_prod_')) keyEnv = 'production';
  else throw new AppError('Formato de chave Asaas inválido', 400, true, 'ASAAS_KEY_FORMAT');

  if (keyEnv !== serverEnvironment()) {
    throw new AppError('A chave é de outro ambiente (sandbox/produção) que o do servidor', 400, true, 'ASAAS_ENV_MISMATCH');
  }

  // Só 401 = chave inválida; qualquer outra falha (rede, timeout, 5xx) = indisponível.
  // Fail closed: nada é gravado.
  try {
    await asaasClient.getAs(key, '/finance/balance');
  } catch (err: any) {
    if (err instanceof AsaasApiError && err.status === 401) {
      throw new AppError('Chave de API do Asaas recusada', 400, true, 'ASAAS_KEY_INVALID');
    }
    // sem a chave: só o tipo do erro e o status HTTP
    logger.warn('[asaasLoja] validação da chave indisponível', { storeId, errName: err?.name, status: err instanceof AsaasApiError ? err.status : undefined });
    throw new AppError('Não foi possível validar a chave no Asaas agora. Tente novamente.', 503, true, 'ASAAS_UNAVAILABLE');
  }

  const data = {
    apiKeyEncrypted: encryptSensitiveData(key),
    apiKeyLast4: key.slice(-4),
    environment: keyEnv,
    status: 'valid',
    // walletId: endpoint não confirmado na doc do Asaas; não é necessário no modo direto.
    walletId: null as string | null,
    lastCheckedAt: new Date(),
    lastError: null as string | null,
  };
  const row = await prisma.storeAsaasAccount.upsert({
    where: { storeId },
    create: { storeId, ...data },
    update: data,
  });
  return toStatus(row);
}

/** Uso interno de services/asaasLoja/*. Nunca expor o retorno por API/log. */
export async function getStoreApiKey(storeId: string): Promise<string> {
  const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
  if (!row || row.status !== 'valid') throw new StoreAsaasNotReadyError();
  return decryptSensitiveData(row.apiKeyEncrypted);
}
