import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import asaasClient from '../asaas/client';
import { decryptSensitiveData } from '../../utils/encryption';
import { AppError } from '../../utils/AppError';

/**
 * Webhook de pagamentos registrado NA CONTA ASAAS DA LOJA (modo SaaS "direto").
 *
 * Cada loja tem um token próprio (`authToken` do Asaas, ecoado no header
 * `asaas-access-token`). O token só existe em claro no momento da criação: no banco
 * fica apenas o SHA-256 (hex). Nunca logar o token nem a chave.
 */

export const STORE_WEBHOOK_EVENTS = [
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REFUNDED',
  'PAYMENT_REFUND_IN_PROGRESS',
  // Fase 2 (Pix automático loja → motoboy). Nesta fase são aceitos e ignorados.
  'TRANSFER_DONE',
  'TRANSFER_FAILED',
  'TRANSFER_CANCELLED',
  // I6: estorno parcial (cancelamento com taxa retida). Nome a CONFIRMAR NO SANDBOX; lojas já
  // conectadas só recebem depois de regravar o webhook.
  'PAYMENT_PARTIALLY_REFUNDED',
] as const;

export const sha256Hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export function storeWebhookUrl(storeId: string): string {
  const base = String(env.PUBLIC_API_URL || 'https://api.dropapp.com.br').replace(/\/+$/, '');
  return `${base}/webhooks/asaas/loja/${encodeURIComponent(storeId)}`;
}

/**
 * Cria o webhook de pagamentos na conta Asaas da loja e grava id + hash do token.
 * Lança em qualquer falha (sem conta, sem e-mail, Asaas recusou/fora do ar): quem
 * chama decide se isso derruba algo (na conexão da chave, NÃO derruba).
 */
export async function registerPaymentWebhook(storeId: string): Promise<void> {
  const row = await prisma.storeAsaasAccount.findUnique({
    where: { storeId },
    select: { status: true, apiKeyEncrypted: true, store: { select: { owner: { select: { email: true } } } } },
  });
  if (!row || row.status !== 'valid') {
    throw new AppError('Conta Asaas da loja não está conectada ou é inválida', 409, true, 'STORE_ASAAS_NOT_READY');
  }
  const email = String(row.store?.owner?.email || env.ASAAS_WEBHOOK_EMAIL || '').trim();
  if (!email) {
    throw new AppError('Sem e-mail de contato para o webhook do Asaas', 422, true, 'STORE_WEBHOOK_NO_EMAIL');
  }

  const apiKey = decryptSensitiveData(row.apiKeyEncrypted);
  const authToken = crypto.randomBytes(24).toString('hex'); // 48 caracteres
  const created = await asaasClient.postAs<{ id?: string }>(apiKey, '/webhooks', {
    name: 'DROP - pagamentos',
    url: storeWebhookUrl(storeId),
    email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken,
    sendType: 'SEQUENTIALLY',
    events: [...STORE_WEBHOOK_EVENTS],
  });
  if (!created?.id) {
    throw new AppError('O Asaas não devolveu o id do webhook criado', 502, true, 'STORE_WEBHOOK_NO_ID');
  }

  await prisma.storeAsaasAccount.update({
    where: { storeId },
    data: { paymentWebhookId: String(created.id), paymentWebhookTokenHash: sha256Hex(authToken) },
  });
}

/**
 * Confere o token recebido contra o hash guardado da loja, em tempo constante
 * (timingSafeEqual sobre os dois SHA-256, sempre 32 bytes).
 * Loja inexistente, sem conta, sem hash ou token vazio → false (sem distinguir o motivo).
 */
export async function verifyStoreWebhookToken(
  storeId: string,
  token: string | undefined | null,
  kind: 'payment' | 'auth',
): Promise<boolean> {
  const row = storeId
    ? await prisma.storeAsaasAccount.findUnique({
        where: { storeId: String(storeId) },
        select: { paymentWebhookTokenHash: true, authWebhookTokenHash: true },
      })
    : null;
  const stored = kind === 'payment' ? row?.paymentWebhookTokenHash : row?.authWebhookTokenHash;
  const received = Buffer.from(sha256Hex(String(token ?? '')), 'hex');
  // Sem hash: compara contra um valor aleatório para não responder mais rápido.
  const expected = Buffer.from(stored && /^[0-9a-f]{64}$/.test(stored) ? stored : crypto.randomBytes(32).toString('hex'), 'hex');
  const equal = crypto.timingSafeEqual(received, expected);
  return equal && !!stored && !!token;
}
