import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';
import { isValidCPF, isValidCNPJ } from '../../utils/documentValidation';
import { decryptSensitiveData } from '../../utils/encryption';
import type { ChargeResult } from '../paymentProvider/types';

/**
 * Cobrança de ENTRADA no modo SaaS "direto": o Pix nasce na conta Asaas DA LOJA
 * (chave própria dela), nunca na conta-mãe. Nada passa pela custódia da DROP.
 *
 * A chave da loja NUNCA vai para log, mensagem de erro ou resposta.
 */

const onlyDigits = (s?: string | null) => String(s || '').replace(/\D/g, '');

/** Loja sem conta Asaas utilizável (ausente, inválida ou chave revogada). */
export class StorePaymentsNotReadyError extends AppError {
  constructor() {
    super('Esta loja ainda não está pronta para receber pagamentos. Tente mais tarde.', 409, true, 'STORE_PAYMENTS_NOT_READY');
    Object.setPrototypeOf(this, StorePaymentsNotReadyError.prototype);
  }
}

export class CpfRequiredError extends AppError {
  constructor() {
    super('Informe seu CPF para pagar com Pix.', 400, true, 'CPF_REQUIRED');
    Object.setPrototypeOf(this, CpfRequiredError.prototype);
  }
}

/** Data de hoje no fuso de São Paulo (YYYY-MM-DD) — `dueDate` do Asaas. */
export function saoPauloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Chave da loja, só se a conta está 'valid'. Senão, StorePaymentsNotReadyError. */
export async function storeKey(storeId: string): Promise<string> {
  const row = await prisma.storeAsaasAccount.findUnique({
    where: { storeId }, select: { status: true, apiKeyEncrypted: true },
  });
  if (!row || row.status !== 'valid') throw new StorePaymentsNotReadyError();
  return decryptSensitiveData(row.apiKeyEncrypted);
}

/**
 * A loja pode vender no modo direto? Conta Asaas 'valid' E ao menos um aceite do termo
 * (qualquer versão; fail closed: conta antiga sem aceite não vende até aceitar).
 * Checagem barata, sem decifrar a chave.
 */
export async function isStorePaymentsReady(storeId: string): Promise<boolean> {
  const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId }, select: { status: true } });
  if (row?.status !== 'valid') return false;
  const consent = await prisma.storeAsaasConsent.findFirst({ where: { storeId }, select: { id: true } });
  return !!consent;
}

/**
 * O Asaas recusou a chave (401): a loja perdeu a capacidade de cobrar.
 * Marca a conta como 'invalid' (o lojista/CEO reconecta ou reteste) e devolve o erro 409.
 */
async function markKeyRevoked(storeId: string): Promise<StorePaymentsNotReadyError> {
  logger.warn('[asaasLoja] chave da loja recusada pelo Asaas (401) — conta marcada invalid', { storeId });
  await prisma.storeAsaasAccount.updateMany({
    where: { storeId },
    data: { status: 'invalid', lastCheckedAt: new Date(), lastError: 'Chave recusada pelo Asaas ao cobrar' },
  }).catch((err) => logger.error('[asaasLoja] falha ao marcar conta invalid', err as Error, { storeId }));
  return new StorePaymentsNotReadyError();
}

/** Traduz um erro de chamada com a chave da loja: 401 → conta invalid + 409. */
export async function translate(storeId: string, err: unknown): Promise<unknown> {
  if (err instanceof AsaasApiError && err.status === 401) return markKeyRevoked(storeId);
  return err;
}

/** CPF/CNPJ de cobrança do usuário (User.cpf, senão o documento aprovado do KYC). */
export function buyerDocument(user: { cpf?: string | null; verification?: unknown } | null): string | null {
  if (!user) return null;
  const candidates = [onlyDigits(user.cpf), onlyDigits((user.verification as any)?.document?.number)];
  return candidates.find((d) => d && (isValidCPF(d) || isValidCNPJ(d))) || null;
}

/**
 * Garante o CPF do comprador ANTES de criar qualquer coisa do pedido.
 * - usuário já tem CPF/CNPJ válido → ok;
 * - senão, aceita `bodyCpf` (só CPF, 11 dígitos, com ou sem máscara) e grava em User.cpf
 *   se o campo estiver vazio;
 * - nenhum válido → CpfRequiredError (400 CPF_REQUIRED);
 * - CPF digitado já pertence a outra conta → 409 CPF_IN_USE.
 */
export async function resolveBuyerCpf(userId: string, bodyCpf?: unknown): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { cpf: true, verification: true } });
  const existing = buyerDocument(user);
  if (existing) return existing;
  const typed = onlyDigits(typeof bodyCpf === 'string' ? bodyCpf : '');
  if (typed.length !== 11 || !isValidCPF(typed)) throw new CpfRequiredError();
  // Um CPF por conta (mesma regra do perfil em userController): CPF de outra conta → 409,
  // sem gravar nada e antes de qualquer pedido/cobrança existir.
  const owner = await prisma.user.findFirst({ where: { id: { not: userId }, cpf: typed }, select: { id: true } });
  if (owner) throw new AppError('Este CPF já está cadastrado em outra conta', 409, true, 'CPF_IN_USE');
  if (!onlyDigits(user?.cpf)) {
    await prisma.user.update({ where: { id: userId }, data: { cpf: typed } });
  }
  return typed;
}

/**
 * Customer do comprador NA CONTA DA LOJA (um por par loja×cliente), cacheado em
 * StoreAsaasCustomer.
 *
 * Corrida (dois pedidos simultâneos do mesmo cliente na mesma loja): os dois podem
 * criar um customer no Asaas, mas só um vira linha no banco (@@unique storeId+userId);
 * o perdedor relê e usa o vencedor. O customer extra fica órfão no Asaas — inofensivo.
 */
export async function ensureStoreCustomer(storeId: string, userId: string, cpfOverride?: string): Promise<string> {
  const cached = await prisma.storeAsaasCustomer.findUnique({ where: { storeId_userId: { storeId, userId } } });
  if (cached) return cached.customerId;

  const apiKey = await storeKey(storeId);
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { id: true, name: true, email: true, cpf: true, telefone: true, verification: true },
  });
  if (!user) throw new AppError('Usuário não encontrado', 404, true, 'USER_NOT_FOUND');
  const doc = cpfOverride && (isValidCPF(cpfOverride) || isValidCNPJ(cpfOverride)) ? cpfOverride : buyerDocument(user);
  if (!doc) throw new CpfRequiredError();

  let customer: { id: string };
  try {
    customer = await asaasClient.postAs<{ id: string }>(apiKey, '/customers', {
      name: user.name,
      email: user.email,
      cpfCnpj: doc,
      mobilePhone: onlyDigits(user.telefone || (user.verification as any)?.phone?.e164) || undefined,
      externalReference: user.id,
    });
  } catch (err) {
    throw await translate(storeId, err);
  }

  try {
    await prisma.storeAsaasCustomer.create({ data: { storeId, userId, customerId: customer.id } });
    return customer.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.storeAsaasCustomer.findUnique({ where: { storeId_userId: { storeId, userId } } });
      if (winner) return winner.customerId;
    }
    throw err;
  }
}

/** Cria a cobrança Pix na conta da loja e devolve o QR (uma tentativa curta). */
export async function createStorePixCharge(params: {
  storeId: string;
  orderId: string;
  buyerUserId: string;
  value: number;
  description?: string;
  cpf?: string;
}): Promise<ChargeResult> {
  const { storeId, orderId } = params;
  const customerId = await ensureStoreCustomer(storeId, params.buyerUserId, params.cpf);
  const apiKey = await storeKey(storeId);

  let payment: { id: string; status: string };
  try {
    payment = await asaasClient.postAs<{ id: string; status: string }>(apiKey, '/payments', {
      customer: customerId,
      billingType: 'PIX',
      value: Number(params.value.toFixed(2)),
      dueDate: saoPauloToday(),
      description: params.description || `Pedido ${orderId}`,
      externalReference: orderId,
    });
  } catch (err) {
    throw await translate(storeId, err);
  }

  const result: ChargeResult = { providerPaymentId: payment.id, status: payment.status, paidSynchronously: false, pix: {} };
  // QR em endpoint separado; falhar aqui não derruba o pedido (o polling rebusca).
  try {
    const qr = await asaasClient.getAs<{ encodedImage: string; payload: string; expirationDate: string }>(
      apiKey, `/payments/${encodeURIComponent(payment.id)}/pixQrCode`, 6000,
    );
    result.pix = { qrCodeImage: qr.encodedImage, qrCodePayload: qr.payload, expiresAt: qr.expirationDate };
  } catch (err) {
    logger.warn('[asaasLoja] cobrança criada mas o QR Pix falhou', {
      storeId, orderId, paymentId: payment.id, errName: (err as any)?.name,
      status: err instanceof AsaasApiError ? err.status : undefined,
    });
  }
  return result;
}

/** Status cru de uma cobrança na conta da loja (null se indisponível). 401 → conta invalid. */
export async function getStorePaymentStatus(storeId: string, paymentId: string): Promise<string | null> {
  const apiKey = await storeKey(storeId);
  try {
    const p = await asaasClient.getAs<{ status: string }>(apiKey, `/payments/${encodeURIComponent(paymentId)}`);
    return p?.status || null;
  } catch (err) {
    const t = await translate(storeId, err);
    if (t instanceof StorePaymentsNotReadyError) throw t;
    logger.warn('[asaasLoja] não foi possível consultar a cobrança', { storeId, paymentId });
    return null;
  }
}

/**
 * Exclui a cobrança na conta da loja (DELETE /payments/{id} com a chave DA LOJA) —
 * equivalente ao `cancelCharge` da conta-mãe. true = excluída (não pode mais ser paga);
 * false = não excluída (já paga, conta sem chave utilizável ou Asaas fora). 401 → conta invalid.
 * Nunca lança: quem expira pedido trata `false` como "não mexer".
 */
export async function cancelStorePixCharge(storeId: string, paymentId: string): Promise<boolean> {
  let apiKey: string;
  try {
    apiKey = await storeKey(storeId);
  } catch {
    logger.warn('[asaasLoja] sem chave utilizável para excluir a cobrança', { storeId, paymentId });
    return false;
  }
  try {
    await asaasClient.deleteAs(apiKey, `/payments/${encodeURIComponent(paymentId)}`);
    return true;
  } catch (err) {
    await translate(storeId, err);
    logger.warn('[asaasLoja] não foi possível excluir a cobrança (provavelmente já paga)', {
      storeId, paymentId, status: err instanceof AsaasApiError ? err.status : undefined,
    });
    return false;
  }
}

/** QR Pix de uma cobrança na conta da loja (chave da loja). 401 → conta invalid + 409. */
export async function getStorePixQrCode(storeId: string, paymentId: string): Promise<{ qrCodeImage?: string; qrCodePayload?: string; expiresAt?: string }> {
  const apiKey = await storeKey(storeId);
  try {
    const qr = await asaasClient.getAs<{ encodedImage: string; payload: string; expirationDate: string }>(
      apiKey, `/payments/${encodeURIComponent(paymentId)}/pixQrCode`, 12000,
    );
    return { qrCodeImage: qr.encodedImage, qrCodePayload: qr.payload, expiresAt: qr.expirationDate };
  } catch (err) {
    throw await translate(storeId, err);
  }
}
