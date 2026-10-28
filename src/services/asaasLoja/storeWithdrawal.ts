// Extrato e saque da conta Asaas DA LOJA (modo direto). O extrato é o do Asaas traduzido para a
// língua da DROP; o saque é um Pix da conta da loja para a chave no CPF/CNPJ do dono dessa conta.
// A chave da loja nunca vai para log; a chave Pix do dono só sai mascarada.
import bcrypt from 'bcryptjs';
import { Prisma, StoreWithdrawal } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { AppError } from '../../utils/AppError';
import { encryptSensitiveData, decryptSensitiveData } from '../../utils/encryption';
import { maskSensitiveText } from '../../utils/safeErrorText';
import { emitAdminNotification } from '../../utils/socketEmitter';
import logger from '../../config/logger';
import { storeKey, translate, saoPauloToday } from './charge';
import { maskPixKey } from './motoboyTransfer';
import { notifyStore, STORE_LINKS } from '../storeNotify';

const cents = (v: unknown) => Math.round(Number(v) * 100);
const fromCents = (c: number) => Math.round(c) / 100;
const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const brl = (v: number) => v.toFixed(2).replace('.', ',');
const orderCode = (orderId: string) => String(orderId).slice(-6).toUpperCase();

/** A trava só aprova um saque pedido há menos que isso: pedido velho preso nunca é aprovado. */
export const WITHDRAWAL_AUTH_WINDOW_MS = 30 * 60 * 1000;
const STATEMENT_DAYS = [7, 30, 90] as const;
const STATEMENT_PAGE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Chave do dono e saldo reservado
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnerPixKey { key: string; type: 'CPF' | 'CNPJ' }

/** CPF/CNPJ do dono da conta Asaas da loja (dados comerciais). É a única chave de saque aceita. */
export async function ownerPixKey(storeId: string, apiKey: string): Promise<OwnerPixKey> {
  let info: { cpfCnpj?: string };
  try {
    info = await asaasClient.getAs<{ cpfCnpj?: string }>(apiKey, '/myAccount/commercialInfo/');
  } catch (err) {
    throw await translate(storeId, err);
  }
  const doc = onlyDigits(info?.cpfCnpj);
  if (doc.length === 11) return { key: doc, type: 'CPF' };
  if (doc.length === 14) return { key: doc, type: 'CNPJ' };
  throw new AppError('Não achamos o CPF ou CNPJ da sua conta de recebimento.', 409, true, 'OWNER_DOCUMENT_MISSING');
}

// Chave mascarada para a tela: CPF com os 2 últimos dígitos; CNPJ com a filial e o dígito.
export function maskOwnerKey(k: OwnerPixKey): string {
  if (k.type === 'CNPJ') return `**.***.***/${k.key.slice(8, 12)}-${k.key.slice(12)}`;
  return maskPixKey(k.key, 'CPF');
}

/**
 * Dinheiro da conta da loja que já tem dono e não pode ser sacado. Erra para o lado seguro
 * (pode contar em dobro um Pix já debitado e ainda sem webhook, nunca deixa de contar):
 *  - Pix ao motoboy e estorno ao cliente que não estão concluídos (`requested` incluso: o débito
 *    no Asaas só acontece depois da trava aprovar);
 *  - frete das corridas em andamento (pool, aceitas ou retiradas) que ainda não viraram Pix;
 *  - saques da própria loja a caminho ou em conferência.
 */
export async function reservedForStore(storeId: string, db: Prisma.TransactionClient = prisma): Promise<{ motoboys: number; refunds: number; withdrawals: number; total: number }> {
  const open = ['pending', 'requested', 'failed', 'failed_final', 'uncertain'];
  const [mt, dr, sw, cfg, rides] = await Promise.all([
    db.motoboyTransfer.aggregate({ where: { storeId, payer: 'store', status: { in: open } }, _sum: { amount: true } }),
    db.directRefund.aggregate({ where: { storeId, status: { in: open } }, _sum: { amount: true } }),
    db.storeWithdrawal.aggregate({ where: { storeId, status: { in: ['requested', 'uncertain'] } }, _sum: { amount: true } }),
    db.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' }, select: { motoboyShareDirect: true } }),
    db.$queryRaw<{ fees: unknown }[]>`
      SELECT COALESCE(SUM(d.fee), 0) AS fees
      FROM "Delivery" d JOIN "Order" o ON o.id = d."orderId"
      WHERE o."storeId" = ${storeId}
        AND d.status::text IN ('pending', 'assigned', 'picked')
        AND o.status::text NOT IN ('cancelado', 'rejeitado')
        AND NOT EXISTS (SELECT 1 FROM "MotoboyTransfer" t WHERE t."deliveryId" = d.id)`,
  ]);
  const share = Number(cfg?.motoboyShareDirect ?? 100) / 100;
  const motoboys = cents(mt._sum.amount ?? 0) + Math.round(cents(rides[0]?.fees ?? 0) * share);
  const refunds = cents(dr._sum.amount ?? 0);
  const withdrawals = cents(sw._sum.amount ?? 0);
  return { motoboys: fromCents(motoboys), refunds: fromCents(refunds), withdrawals: fromCents(withdrawals), total: fromCents(motoboys + refunds + withdrawals) };
}

async function storeBalance(storeId: string, apiKey: string): Promise<number> {
  try {
    const b = await asaasClient.getAs<{ balance: number }>(apiKey, '/finance/balance');
    return Number(b?.balance) || 0;
  } catch (err) {
    throw await translate(storeId, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extrato
// ─────────────────────────────────────────────────────────────────────────────

interface AsaasTransaction {
  id: string;
  value: number;
  balance: number;
  type: string;
  date: string;
  description?: string;
  paymentId?: string | null;
  transferId?: string | null;
}

export interface StatementItem {
  id: string;
  date: string;
  label: string;
  orderId: string | null;
  value: number;
  balance: number;
}

const NOTICE_FEES = new Set(['PAYMENT_MESSAGING_NOTIFICATION_FEE', 'PAYMENT_SMS_NOTIFICATION_FEE', 'PHONE_CALL_NOTIFICATION_FEE', 'INSTANT_TEXT_MESSAGE_FEE']);
const PIX_BACK = new Set(['TRANSFER_REVERSAL', 'PIX_TRANSACTION_DEBIT_REFUND', 'INTERNAL_TRANSFER_REVERSAL', 'DEBIT_REVERSAL']);

/** Descrição crua do Asaas sem o número de fatura (e sem o nome do Asaas). */
function cleanDescription(d?: string): string {
  const s = String(d ?? '').replace(/\s*-\s*fatura nr\.?\s*\d+.*$/i, '').replace(/\bAsaas\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return s || 'Movimentação';
}

/** Número do id do Asaas (ftn_000015274322 → 15274322) para desempatar a ordem no mesmo dia. */
const idNum = (id: string) => Number(String(id).replace(/\D/g, '')) || 0;

/**
 * Traduz uma linha do extrato do Asaas. `orderByPayment` e `transferKind` vêm do banco da DROP:
 * a venda ganha o número do pedido, e o Pix enviado vira "Frete ao motoboy" ou "Saque".
 */
export function describeTransaction(
  t: AsaasTransaction,
  orderByPayment: Map<string, string>,
  transferKind: Map<string, { kind: 'motoboy' | 'withdrawal'; orderId?: string }>,
): StatementItem {
  const orderId = (t.paymentId && orderByPayment.get(t.paymentId)) || null;
  const transfer = t.transferId ? transferKind.get(t.transferId) : undefined;
  const onOrder = (label: string, id: string | null | undefined) => (id ? `${label} · Pedido #${orderCode(id)}` : label);
  let label: string;
  let linkedOrder: string | null = orderId;
  if (t.type === 'PAYMENT_RECEIVED') label = onOrder('Venda', orderId);
  else if (t.type === 'PAYMENT_FEE') label = onOrder('Taxa do Pix da venda', orderId);
  else if (NOTICE_FEES.has(t.type)) label = onOrder('Taxa de aviso ao cliente', orderId);
  else if (t.type === 'PAYMENT_REVERSAL') label = onOrder('Estorno ao cliente', orderId);
  else if (t.type === 'PAYMENT_FEE_REVERSAL') label = onOrder('Taxa da venda devolvida', orderId);
  else if (t.type === 'TRANSFER_FEE') label = 'Taxa do Pix enviado';
  else if (t.type === 'TRANSFER' || PIX_BACK.has(t.type) || (t.transferId && Number(t.value) > 0)) {
    const back = t.type !== 'TRANSFER';
    linkedOrder = transfer?.orderId ?? null;
    if (transfer?.kind === 'motoboy') label = onOrder(back ? 'Frete ao motoboy devolvido' : 'Frete ao motoboy', transfer.orderId);
    else if (transfer?.kind === 'withdrawal') label = back ? 'Saque devolvido' : 'Saque para seu Pix';
    else label = back ? 'Pix devolvido' : 'Pix enviado';
  } else if (t.type === 'PIX_TRANSACTION_CREDIT') label = 'Pix recebido';
  else if (t.type === 'CHARGEBACK') label = onOrder('Contestação de pagamento', orderId);
  else label = cleanDescription(t.description);
  return { id: t.id, date: t.date, label, orderId: linkedOrder, value: Number(t.value) || 0, balance: Number(t.balance) || 0 };
}

function daysAgo(days: number, now: Date): string {
  return saoPauloToday(new Date(now.getTime() - (days - 1) * 86_400_000));
}

export interface StoreStatement {
  balance: number;
  reserved: { motoboys: number; refunds: number; withdrawals: number; total: number };
  available: number;
  withdrawTo: string | null;
  items: StatementItem[];
  hasMore: boolean;
  days: number;
}

/** Saldo, quanto pode sacar e uma página do extrato (mais recentes primeiro). */
export async function getStoreStatement(storeId: string, opts: { days?: number; offset?: number } = {}, now = new Date()): Promise<StoreStatement> {
  const days = (STATEMENT_DAYS as readonly number[]).includes(Number(opts.days)) ? Number(opts.days) : 30;
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const apiKey = await storeKey(storeId);

  const qs = new URLSearchParams({
    startDate: daysAgo(days, now), finishDate: saoPauloToday(now), order: 'desc',
    offset: String(offset), limit: String(STATEMENT_PAGE),
  });
  let page: { data?: AsaasTransaction[]; hasMore?: boolean };
  try {
    page = await asaasClient.getAs(apiKey, `/financialTransactions?${qs.toString()}`);
  } catch (err) {
    throw await translate(storeId, err);
  }
  const rows = Array.isArray(page?.data) ? page.data : [];

  const paymentIds = [...new Set(rows.map((r) => r.paymentId).filter((x): x is string => !!x))];
  const transferIds = [...new Set(rows.map((r) => r.transferId).filter((x): x is string => !!x))];
  const [orders, motoboyTransfers, withdrawals] = await Promise.all([
    paymentIds.length ? prisma.order.findMany({ where: { storeId, asaasPaymentId: { in: paymentIds } }, select: { id: true, asaasPaymentId: true } }) : [],
    transferIds.length ? prisma.motoboyTransfer.findMany({
      where: { storeId, OR: [{ asaasTransferId: { in: transferIds } }, { previousAsaasTransferIds: { hasSome: transferIds } }] },
      select: { orderId: true, asaasTransferId: true, previousAsaasTransferIds: true },
    }) : [],
    transferIds.length ? prisma.storeWithdrawal.findMany({ where: { storeId, asaasTransferId: { in: transferIds } }, select: { asaasTransferId: true } }) : [],
  ]);
  const orderByPayment = new Map<string, string>(orders.map((o): [string, string] => [String(o.asaasPaymentId), o.id]));
  const transferKind = new Map<string, { kind: 'motoboy' | 'withdrawal'; orderId?: string }>();
  for (const m of motoboyTransfers) {
    for (const id of [m.asaasTransferId, ...(m.previousAsaasTransferIds ?? [])]) if (id) transferKind.set(id, { kind: 'motoboy', orderId: m.orderId });
  }
  for (const w of withdrawals) if (w.asaasTransferId) transferKind.set(w.asaasTransferId, { kind: 'withdrawal' });

  const items = rows
    .map((r) => describeTransaction(r, orderByPayment, transferKind))
    .sort((a, b) => (a.date === b.date ? idNum(b.id) - idNum(a.id) : a.date < b.date ? 1 : -1));

  const [balance, reserved] = await Promise.all([storeBalance(storeId, apiKey), reservedForStore(storeId)]);
  let withdrawTo: string | null = null;
  try {
    withdrawTo = maskOwnerKey(await ownerPixKey(storeId, apiKey));
  } catch {
    withdrawTo = null; // sem documento: a tela mostra o saque indisponível
  }
  return {
    balance,
    reserved,
    available: fromCents(Math.max(0, cents(balance) - cents(reserved.total))),
    withdrawTo,
    items,
    hasMore: !!page?.hasMore,
    days,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Saque
// ─────────────────────────────────────────────────────────────────────────────

function safeErrorText(err: unknown): string {
  if (err instanceof AsaasApiError) {
    const e = err.errors?.[0];
    const code = e?.code || `HTTP_${err.status}`;
    const desc = maskSensitiveText(e?.description);
    return desc ? `${code}: ${desc}` : code;
  }
  return (err as Error)?.message || 'erro';
}

/** Frase para o lojista quando o Asaas recusa o saque. */
function refusalMessage(err: unknown): string {
  const text = safeErrorText(err);
  if (/insufficient_permission/i.test(text)) return 'Sua conta de recebimento não deixou a DROP fazer o Pix. Libere a permissão de Transferências na chave de API.';
  if (/saldo|insufficient|balance/i.test(text)) return 'Não tem saldo suficiente para este saque agora.';
  return 'Não deu para fazer o saque. Confira se o seu CPF ou CNPJ tem chave Pix cadastrada num banco e tente de novo.';
}

function serializeWithdrawal(w: StoreWithdrawal) {
  return { id: w.id, amount: Number(w.amount), status: w.status, createdAt: w.createdAt, doneAt: w.doneAt };
}

/**
 * Pede o saque: confere a senha do dono, trava a conta da loja, confere o disponível
 * (saldo − reservado) e cria a linha `requested` antes de chamar o Asaas — a trava de
 * autorização só aprova Pix que está nessa tabela. Um saque de cada vez por loja.
 */
export async function requestStoreWithdrawal(storeId: string, userId: string, amountIn: number, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !password || !(await bcrypt.compare(String(password), user.passwordHash))) {
    throw new AppError('Senha incorreta.', 400, true, 'WRONG_PASSWORD');
  }
  const amount = cents(amountIn);
  if (!(amount > 0)) throw new AppError('Informe o valor do saque.', 400, true, 'INVALID_AMOUNT');
  const cfg = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' }, select: { storeMinimumWithdraw: true } });
  const minimum = cents(cfg?.storeMinimumWithdraw ?? 10);
  if (amount < minimum) throw new AppError(`O saque mínimo é R$ ${brl(fromCents(minimum))}.`, 400, true, 'BELOW_MINIMUM');

  const apiKey = await storeKey(storeId);
  const owner = await ownerPixKey(storeId, apiKey);

  // Saldo lido fora da trava (sem rede dentro da transação). Ele só sobe com vendas; o que sai
  // da conta pela DROP está na reserva, conferida dentro da trava.
  const balance = await storeBalance(storeId, apiKey);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StoreAsaasAccount" WHERE "storeId" = ${storeId} FOR UPDATE`;
    // Um saque de cada vez: a caminho ou em conferência (o Pix pode ter saído) segura o próximo.
    const inFlight = await tx.storeWithdrawal.count({ where: { storeId, status: { in: ['requested', 'uncertain'] } } });
    if (inFlight > 0) throw new AppError('Já tem um saque a caminho. Espere ele cair para pedir outro.', 409, true, 'WITHDRAWAL_IN_PROGRESS');
    const reserved = await reservedForStore(storeId, tx);
    const available = Math.max(0, cents(balance) - cents(reserved.total));
    if (amount > available) {
      throw new AppError(`Você pode sacar até R$ ${brl(fromCents(available))} agora.`, 409, true, 'OVER_AVAILABLE');
    }
    return tx.storeWithdrawal.create({
      data: {
        storeId, requestedBy: userId, amount: fromCents(amount),
        pixKeyEncrypted: encryptSensitiveData(owner.key), pixKeyType: owner.type,
      },
    });
  });

  let response: { id?: string };
  try {
    response = await asaasClient.postAs(apiKey, '/transfers', {
      value: fromCents(amount),
      operationType: 'PIX',
      pixAddressKey: owner.key,
      pixAddressKeyType: owner.type,
      externalReference: row.id,
      description: 'DROP saque da loja',
    });
  } catch (err) {
    const t = await translate(storeId, err);
    const definite = t instanceof AppError || (err instanceof AsaasApiError && err.status >= 400 && err.status < 500 && err.status !== 408);
    if (definite) {
      await prisma.storeWithdrawal.updateMany({ where: { id: row.id, status: 'requested' }, data: { status: 'failed', lastError: safeErrorText(err).slice(0, 500) } });
      logger.warn('[storeWithdrawal] saque recusado pelo Asaas', { withdrawalId: row.id, storeId });
      throw new AppError(refusalMessage(err), 409, true, 'WITHDRAWAL_REFUSED');
    }
    await prisma.storeWithdrawal.updateMany({ where: { id: row.id, status: 'requested' }, data: { status: 'uncertain', lastError: 'UNCERTAIN' } });
    logger.error('[storeWithdrawal] resposta incerta do Asaas — conferir antes de qualquer reenvio', err as Error, { withdrawalId: row.id, storeId });
    emitAdminNotification({
      title: 'Saque de loja com resposta incerta',
      body: `Loja ${storeId.slice(-6)}: saque de R$ ${brl(fromCents(amount))}. Conferir no Asaas da loja.`,
      url: '/admin/lojas-asaas',
      tag: `store-withdrawal-${row.id}`,
    });
    return { withdrawal: serializeWithdrawal({ ...row, status: 'uncertain' }), uncertain: true };
  }

  const asaasId = typeof response?.id === 'string' ? response.id : null;
  if (asaasId) {
    await prisma.storeWithdrawal.updateMany({
      where: { id: row.id, OR: [{ asaasTransferId: null }, { asaasTransferId: asaasId }] },
      data: { asaasTransferId: asaasId },
    });
  }
  logger.info('[storeWithdrawal] saque enviado ao Asaas', { withdrawalId: row.id, storeId });
  const fresh = await prisma.storeWithdrawal.findUnique({ where: { id: row.id } });
  return { withdrawal: serializeWithdrawal(fresh!), uncertain: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trava de autorização e webhook
// ─────────────────────────────────────────────────────────────────────────────

export type WithdrawalDecision = { approved: boolean; reason?: string; transferId?: string | null };

/**
 * Trava de autorização para o saque: só aprova `requested` da mesma loja, mesmo valor e mesma
 * chave (a do dono, gravada no pedido), vinculando o id do Asaas uma única vez.
 * null = a referência não é um saque (quem chamou segue com o próximo tipo).
 */
export async function decideStoreWithdrawal(
  storeId: string,
  req: { transferId: string; asaasId: string; valueCents: number | null; pixKey: string },
): Promise<WithdrawalDecision | null> {
  const w = await prisma.storeWithdrawal.findUnique({ where: { id: req.transferId } });
  if (!w) return null;
  const refuse = (reason: string): WithdrawalDecision => ({ approved: false, reason, transferId: w.id });
  if (w.storeId !== storeId) return refuse('STORE_MISMATCH');
  if (w.status !== 'requested') return refuse('INVALID_STATUS');
  if (Date.now() - w.createdAt.getTime() > WITHDRAWAL_AUTH_WINDOW_MS) return refuse('EXPIRED');
  if (req.valueCents === null || req.valueCents !== cents(w.amount)) return refuse('AMOUNT_MISMATCH');
  let key = '';
  try {
    key = decryptSensitiveData(w.pixKeyEncrypted);
  } catch {
    return refuse('PIX_KEY_UNREADABLE');
  }
  // Só a chave CPF/CNPJ inteira: tira apenas a pontuação do documento, nunca letras (um e-mail
  // ou EVP com os mesmos dígitos não é a chave do dono).
  const asked = String(req.pixKey ?? '').trim().replace(/[.\-/\s]/g, '');
  if (!key || !/^(\d{11}|\d{14})$/.test(asked) || asked !== key) return refuse('PIX_KEY_MISMATCH');
  const upd = await prisma.storeWithdrawal.updateMany({
    where: { id: w.id, status: 'requested', authorizedAt: null, OR: [{ asaasTransferId: null }, { asaasTransferId: req.asaasId }] },
    data: { authorizedAt: new Date(), asaasTransferId: req.asaasId },
  });
  if (upd.count !== 1) {
    const again = await prisma.storeWithdrawal.findUnique({ where: { id: w.id }, select: { status: true, authorizedAt: true, asaasTransferId: true } });
    if (!again || again.status !== 'requested') return refuse('INVALID_STATUS');
    if (!(again.authorizedAt && again.asaasTransferId === req.asaasId)) return refuse('ALREADY_AUTHORIZED');
  }
  return { approved: true, transferId: w.id };
}

/**
 * TRANSFER_DONE / FAILED / CANCELLED de um saque. true = era um saque (tratado aqui);
 * false = não é saque (o webhook segue para o Pix do motoboy).
 */
export async function reconcileStoreWithdrawalFromWebhook(storeId: string, event: string, transfer: any): Promise<boolean> {
  const ref = typeof transfer?.externalReference === 'string' ? transfer.externalReference.trim() : '';
  const asaasId = typeof transfer?.id === 'string' ? transfer.id.trim() : '';
  const w = ref
    ? await prisma.storeWithdrawal.findFirst({ where: { id: ref, storeId } })
    : asaasId ? await prisma.storeWithdrawal.findFirst({ where: { asaasTransferId: asaasId, storeId } }) : null;
  if (!w) return false;
  if (asaasId && w.asaasTransferId && w.asaasTransferId !== asaasId) {
    logger.error('[storeWithdrawal] webhook com id do Asaas diferente do vinculado (ignorado)', new Error('ASAAS_ID_MISMATCH'), { withdrawalId: w.id, storeId, event });
    return true;
  }
  const bind = { OR: [{ asaasTransferId: null }, { asaasTransferId: asaasId || w.asaasTransferId }] };
  if (event === 'TRANSFER_DONE') {
    // O Pix saiu: vale também para linha dada como falha (o Asaas é quem sabe). `done` nunca regride.
    if (w.status === 'failed') logger.warn('[storeWithdrawal] saque dado como falha foi concluído no Asaas', { withdrawalId: w.id, storeId });
    const { count } = await prisma.storeWithdrawal.updateMany({
      where: { id: w.id, status: { in: ['requested', 'uncertain', 'failed'] }, ...bind },
      data: { status: 'done', doneAt: new Date(), lastError: null, ...(asaasId ? { asaasTransferId: asaasId } : {}) },
    });
    if (count === 1) {
      void notifyStore(storeId, {
        title: 'Saque feito',
        message: `R$ ${brl(Number(w.amount))} foram para o seu Pix.`,
        link: STORE_LINKS.money,
        entityId: w.id,
        type: 'system',
      });
    }
    return true;
  }
  await prisma.storeWithdrawal.updateMany({
    where: { id: w.id, status: { in: ['requested', 'uncertain'] }, ...bind },
    data: { status: 'failed', lastError: event },
  });
  return true;
}
