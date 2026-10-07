import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { encryptSensitiveData, decryptSensitiveData } from '../../utils/encryption';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';
import { registerPaymentWebhook } from './webhook';

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

/**
 * Chama /finance/balance com a chave. true = aceita; false = 401 (recusada).
 * Qualquer outra falha (rede, timeout, 5xx) = ASAAS_UNAVAILABLE (503), logada sem a chave.
 */
async function probeKey(storeId: string, key: string): Promise<boolean> {
  try {
    await asaasClient.getAs(key, '/finance/balance');
    return true;
  } catch (err: any) {
    if (err instanceof AsaasApiError && err.status === 401) return false;
    logger.warn('[asaasLoja] validação da chave indisponível', { storeId, errName: err?.name, status: err instanceof AsaasApiError ? err.status : undefined });
    throw new AppError('Não foi possível validar a chave no Asaas agora. Tente novamente.', 503, true, 'ASAAS_UNAVAILABLE');
  }
}

export async function connectStoreAsaas(storeId: string, rawApiKey: string, actorId: string): Promise<StoreAsaasStatus> {
  const key = String(rawApiKey || '').trim();
  let keyEnv: 'sandbox' | 'production';
  if (key.startsWith('$aact_hmlg_')) keyEnv = 'sandbox';
  else if (key.startsWith('$aact_prod_')) keyEnv = 'production';
  else throw new AppError('Formato de chave Asaas inválido', 400, true, 'ASAAS_KEY_FORMAT');

  if (keyEnv !== serverEnvironment()) {
    throw new AppError('A chave é de outro ambiente (sandbox/produção) que o do servidor', 400, true, 'ASAAS_ENV_MISMATCH');
  }

  // Fail closed: nada é gravado se a chave não for aceita.
  if (!(await probeKey(storeId, key))) {
    throw new AppError('Chave de API do Asaas recusada', 400, true, 'ASAAS_KEY_INVALID');
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
  // Conta + audit na MESMA transação: não existe troca de conta sem rastro.
  const row = await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw new AppError('Loja não encontrada', 404, true, 'STORE_NOT_FOUND');
    const existing = await tx.storeAsaasAccount.findUnique({ where: { storeId }, select: { id: true, apiKeyEncrypted: true } });
    // Chave nova ≠ antiga: webhook, tokens e confirmações eram da conta anterior → zera
    // (o webhook novo é registrado abaixo). Mesma chave: mantém o que já existe.
    const sameKey = !!existing && sameStoredKey(existing.apiKeyEncrypted, key);
    const update = sameKey ? data : { ...data, ...RESET_ACCOUNT_BOUND_FIELDS };
    const saved = await tx.storeAsaasAccount.upsert({
      where: { storeId },
      create: { storeId, ...data },
      update,
    });
    await tx.storeAsaasAudit.create({
      data: { storeId, actorId, action: existing ? 'replace' : 'connect', apiKeyLast4: data.apiKeyLast4 },
    });
    // Customers do Asaas pertencem à conta: com conta nova, o cache de StoreAsaasCustomer não vale mais.
    await tx.storeAsaasCustomer.deleteMany({ where: { storeId } });
    return saved;
  });

  // Webhook de pagamentos na conta da loja. Falhar aqui NÃO derruba a conexão: a chave
  // continua 'valid', o checklist mostra paymentWebhook=false e o pagamento ainda é
  // conciliado pelo polling (GET /orders/:id/pix).
  if (!row.paymentWebhookId) {
    try {
      await registerPaymentWebhook(storeId);
    } catch (err: any) {
      logger.warn('[asaasLoja] não foi possível registrar o webhook de pagamentos da loja', {
        storeId, errName: err?.name, code: err?.code, status: err instanceof AsaasApiError ? err.status : undefined,
      });
      await prisma.storeAsaasAccount.update({
        where: { storeId },
        data: { lastError: 'Não foi possível registrar o webhook de pagamentos no Asaas' },
      });
    }
  }
  return getStoreAsaasStatus(storeId);
}

/** Campos que pertencem à CONTA Asaas (não à loja): perdem validade quando a chave muda. */
const RESET_ACCOUNT_BOUND_FIELDS = {
  paymentWebhookId: null,
  paymentWebhookTokenHash: null,
  authWebhookTokenHash: null,
  ipWhitelistConfirmedAt: null,
  authWebhookConfirmedAt: null,
};

/** A chave cifrada guardada é igual a `key`? (decifra só aqui; falha ao decifrar = diferente) */
function sameStoredKey(apiKeyEncrypted: string, key: string): boolean {
  try {
    const a = Buffer.from(decryptSensitiveData(apiKeyEncrypted), 'utf8');
    const b = Buffer.from(key, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Desconecta a conta Asaas da loja (apaga a linha) e audita. Sem conta → 404. */
export async function disconnectStoreAsaas(storeId: string, actorId: string): Promise<StoreAsaasStatus> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.storeAsaasAccount.findUnique({ where: { storeId }, select: { apiKeyLast4: true } });
    if (!existing) throw new AppError('Esta loja não tem conta Asaas conectada', 404, true, 'STORE_ASAAS_NOT_FOUND');
    await tx.storeAsaasAccount.delete({ where: { storeId } });
    await tx.storeAsaasCustomer.deleteMany({ where: { storeId } });
    await tx.storeAsaasAudit.create({
      data: { storeId, actorId, action: 'disconnect', apiKeyLast4: existing.apiKeyLast4 },
    });
  });
  return toStatus(null);
}

/** Visão do admin: todas as lojas com o estado da conta (nunca a chave nem hashes). */
export async function listStoresAsaas() {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, asaasAccount: { select: { status: true, environment: true, apiKeyLast4: true, lastCheckedAt: true } } },
    orderBy: { name: 'asc' },
  });
  return stores.map((s) => ({
    storeId: s.id,
    name: s.name,
    status: (s.asaasAccount ? (s.asaasAccount.status === 'valid' ? 'valid' : 'invalid') : 'none') as 'none' | 'valid' | 'invalid',
    environment: (s.asaasAccount?.environment ?? null) as 'sandbox' | 'production' | null,
    apiKeyLast4: s.asaasAccount?.apiKeyLast4 ?? null,
    lastCheckedAt: s.asaasAccount?.lastCheckedAt ? s.asaasAccount.lastCheckedAt.toISOString() : null,
  }));
}

/** Uso interno de services/asaasLoja/*. Nunca expor o retorno por API/log. */
export async function getStoreApiKey(storeId: string): Promise<string> {
  const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
  if (!row || row.status !== 'valid') throw new StoreAsaasNotReadyError();
  return decryptSensitiveData(row.apiKeyEncrypted);
}

/**
 * "Testar configuração". Decifra direto da linha (qualquer status), então uma conta
 * 'invalid' pode ser retestada e volta a 'valid' se o Asaas aceitar. Sem linha → NotReady.
 * O webhook de pagamentos só é conferido se existir `paymentWebhookId`.
 */
export async function testStoreAsaas(storeId: string): Promise<StoreAsaasStatus> {
  const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
  if (!row) throw new StoreAsaasNotReadyError();
  const key = decryptSensitiveData(row.apiKeyEncrypted);

  const apiKeyOk = await probeKey(storeId, key);
  await prisma.storeAsaasAccount.update({
    where: { storeId },
    data: apiKeyOk
      ? { status: 'valid', lastCheckedAt: new Date(), lastError: null }
      : { status: 'invalid', lastCheckedAt: new Date(), lastError: 'Chave recusada pelo Asaas' },
  });

  let paymentWebhook = false;
  if (apiKeyOk && row.paymentWebhookId) {
    try {
      const wh: any = await asaasClient.getAs(key, `/webhooks/${encodeURIComponent(row.paymentWebhookId)}`);
      paymentWebhook = !!wh && wh.enabled === true && wh.interrupted !== true;
    } catch {
      paymentWebhook = false;
    }
  }
  const status = await getStoreAsaasStatus(storeId);
  return { ...status, checklist: { ...status.checklist, apiKey: apiKeyOk, paymentWebhook } };
}
