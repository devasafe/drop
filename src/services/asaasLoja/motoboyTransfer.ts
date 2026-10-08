// Transferência Pix da loja ao motoboy (modo direto): registro da linha MotoboyTransfer
// dentro da transação da entrega, envio pela conta Asaas DA LOJA (sendTransfer, chamado pelo
// job motoboyTransfers) e reconciliação pelos webhooks TRANSFER_*.
import { Prisma, MotoboyTransfer } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { encryptSensitiveData, decryptSensitiveData } from '../../utils/encryption';
import { getSaasConfig } from '../../utils/settlement';
import { emitToRoom, emitAdminNotification } from '../../utils/socketEmitter';
import logger from '../../config/logger';
import { maskSensitiveText } from '../../utils/safeErrorText';
import { storeKey, translate, saoPauloToday, StorePaymentsNotReadyError } from './charge';
import { DIRECT_REFUND_BACKOFF_MS } from './refund';

export type TransferReason = 'delivery' | 'cancellation_compensation';

const DEFAULT_MAX_AMOUNT = 150;

/**
 * Máscara de chave Pix para logs/notificações: nunca devolve a chave inteira.
 * `type` (CPF/CNPJ/EMAIL/PHONE/EVP) desambigua 11 dígitos (CPF x celular); sem ele,
 * 11 dígitos puros são tratados como CPF e telefone exige +55 ou parênteses.
 */
export function maskPixKey(key: string, type?: string): string {
  const k = String(key ?? '').trim();
  if (!k) return '';
  const t = String(type ?? '').toUpperCase();
  const digits = k.replace(/\D/g, '');
  if (t === 'EMAIL' || k.includes('@')) {
    const [user, domain = ''] = k.split('@');
    const dot = domain.indexOf('.');
    const host = dot >= 0 ? domain.slice(0, dot) : domain;
    const tld = dot >= 0 ? domain.slice(dot) : '';
    return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
  }
  const looksPhone = t === 'PHONE' || k.startsWith('+') || k.includes('(');
  if (looksPhone && digits.length >= 10) return `(**) *****-${digits.slice(-4)}`;
  if ((t === 'CPF' || !t) && digits.length === 11 && /^[\d.\-\s]+$/.test(k)) return `***.***.***-${digits.slice(-2)}`;
  // Chave desconhecida/aleatória (EVP): só os 4 últimos caracteres.
  if (k.length <= 8) return '*'.repeat(k.length);
  return `***${k.slice(-4)}`;
}

/** Chave Pix ATUAL do motoboy (User.asaas.pixKey/pixKeyType) — usada para o snapshot da transferência. */
async function motoboyPixSnapshot(tx: Prisma.TransactionClient, motoboyId: string | null): Promise<{ pixKey: string; pixKeyType: string }> {
  const user = motoboyId ? await tx.user.findUnique({ where: { id: String(motoboyId) }, select: { asaas: true } }) : null;
  const asaas: any = user?.asaas ?? {};
  const pixKey = typeof asaas.pixKey === 'string' ? asaas.pixKey.trim() : '';
  return { pixKey, pixKeyType: String(asaas.pixKeyType ?? '') };
}

/**
 * Cria a MotoboyTransfer da entrega (1 por delivery, unique em deliveryId).
 * Deve ser chamada DENTRO da transação da trava picked→delivered.
 */
export async function createTransferForDelivery(
  tx: Prisma.TransactionClient,
  delivery: { id: string; motoboyId: string | null; fee: any },
  order: { id: string; storeId: string },
  reason: TransferReason = 'delivery',
  amountOverride?: number,
): Promise<MotoboyTransfer> {
  // Config lida pelo `tx` (mesma conexão/snapshot da transação que grava a linha).
  const pc: any = await tx.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  const maxAmount = Number(pc?.directTransferMaxAmount ?? DEFAULT_MAX_AMOUNT);
  const motoboyShareDirect = Number(pc?.motoboyShareDirect ?? 100);
  const base = amountOverride != null ? Number(amountOverride) : (Number(delivery.fee) * motoboyShareDirect) / 100;
  const amount = Math.round(base * 100) / 100;

  const { pixKey, pixKeyType } = await motoboyPixSnapshot(tx, delivery.motoboyId);

  let status = 'pending';
  let lastError: string | null = null;
  if (Math.round(amount * 100) > Math.round(maxAmount * 100)) {
    status = 'failed_final';
    lastError = 'AMOUNT_OVER_LIMIT';
  } else if (!pixKey) {
    status = 'failed';
    lastError = 'MOTOBOY_PIX_KEY_MISSING';
  }

  return tx.motoboyTransfer.create({
    data: {
      deliveryId: delivery.id,
      orderId: order.id,
      storeId: order.storeId,
      motoboyId: String(delivery.motoboyId),
      reason,
      amount,
      pixKeyEncrypted: pixKey ? encryptSensitiveData(pixKey) : '',
      pixKeyType: pixKey ? pixKeyType : '',
      status,
      lastError,
    },
  });
}

/** Avisos pós-commit (socket só para salas; sem chave Pix no payload). */
export function notifyTransferCreated(t: Pick<MotoboyTransfer, 'id' | 'status' | 'lastError' | 'motoboyId' | 'storeId' | 'orderId' | 'amount'>): void {
  if (t.status === 'pending') return;
  try {
    const payload = { transferId: t.id, orderId: t.orderId, storeId: t.storeId, amount: Number(t.amount), error: t.lastError };
    if (t.lastError === 'MOTOBOY_PIX_KEY_MISSING') {
      emitToRoom(`user:${t.motoboyId}`, 'motoboy:transfer_pix_key_missing', payload);
    }
    const shortId = String(t.orderId).slice(-6);
    const valor = Number(t.amount).toFixed(2).replace('.', ',');
    emitAdminNotification({
      title: t.lastError === 'AMOUNT_OVER_LIMIT' ? 'Transferência ao motoboy acima do limite' : 'Transferência ao motoboy pendente',
      body: t.lastError === 'AMOUNT_OVER_LIMIT'
        ? `Pedido ${shortId}: R$ ${valor} acima do teto; requer análise.`
        : `Pedido ${shortId}: R$ ${valor} sem chave Pix cadastrada pelo motoboy.`,
      url: '/admin/transfers',
      tag: `motoboy-transfer-${t.id}`,
    });
    logger.warn('[motoboyTransfer] transferência nasceu com pendência', { transferId: t.id, status: t.status, error: t.lastError });
  } catch (err) {
    logger.error('[motoboyTransfer] falha ao notificar', err as Error, { transferId: t.id });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envio (Task 2.3)
// ─────────────────────────────────────────────────────────────────────────────

export type MotoboyTransferStatus = 'pending' | 'requested' | 'done' | 'failed' | 'failed_final' | 'uncertain';

/** P5: mesma escada do estorno direto (5 min, 15 min, 1 h, 3 h, 6 h). A 6ª falha é final. */
export const MOTOBOY_TRANSFER_BACKOFF_MS = DIRECT_REFUND_BACKOFF_MS;

const cents = (v: unknown) => Math.round(Number(v) * 100);
const brl = (v: unknown) => Number(v).toFixed(2).replace('.', ',');
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Início do dia civil de São Paulo. ASSUME offset fixo −03:00, sem horário de verão (extinto
 * em 2019); se o horário de verão voltar, este cálculo precisa mudar.
 */
export function saoPauloDayStart(now: Date = new Date()): Date {
  return new Date(`${saoPauloToday(now)}T00:00:00-03:00`);
}

type AlertRow = Pick<MotoboyTransfer, 'id' | 'orderId' | 'storeId' | 'amount'>;

function alertAdmin(t: AlertRow, title: string, detail: string): void {
  try {
    emitAdminNotification({
      title,
      body: `Pedido ${String(t.orderId).slice(-6)}: R$ ${brl(t.amount)} — ${detail}`,
      url: '/admin/transfers',
      tag: `motoboy-transfer-${t.id}`,
    });
  } catch (err) {
    logger.error('[motoboyTransfer] falha ao alertar o admin', err as Error, { transferId: t.id });
  }
}

/**
 * Falha DEFINIDA (nada foi pago): `failed` com backoff P5 contado por `attempts`;
 * sem degrau restante → `failed_final` + alerta. Condicional ao status de origem.
 */
async function registerFailure(
  t: AlertRow & { attempts: number },
  message: string,
  from: MotoboyTransferStatus[],
  now: Date = new Date(),
  bindAsaasId?: string,
): Promise<'failed' | 'failed_final' | null> {
  const lastError = String(message || 'erro').slice(0, 500);
  const backoff = MOTOBOY_TRANSFER_BACKOFF_MS[Math.max(t.attempts, 1) - 1];
  // Webhook com o vínculo ainda nulo: vincula o id do Asaas na mesma escrita (condicional),
  // para que a retentativa o mova para previousAsaasTransferIds.
  const bindWhere = bindAsaasId ? { OR: [{ asaasTransferId: null }, { asaasTransferId: bindAsaasId }] } : {};
  const bindData = bindAsaasId ? { asaasTransferId: bindAsaasId } : {};
  if (backoff === undefined) {
    const { count } = await prisma.motoboyTransfer.updateMany({
      where: { id: t.id, status: { in: from }, ...bindWhere },
      data: { status: 'failed_final', lastError, ...bindData },
    });
    if (count !== 1) return null;
    logger.warn('[motoboyTransfer] transferência esgotou as tentativas', { transferId: t.id, storeId: t.storeId, attempts: t.attempts });
    alertAdmin(t, 'Pix ao motoboy falhou em definitivo', `${t.attempts} tentativas sem sucesso; requer ação do admin.`);
    return 'failed_final';
  }
  const { count } = await prisma.motoboyTransfer.updateMany({
    where: { id: t.id, status: { in: from }, ...bindWhere },
    data: { status: 'failed', lastError, nextAttemptAt: new Date(now.getTime() + backoff), ...bindData },
  });
  if (count !== 1) return null;
  logger.warn('[motoboyTransfer] transferência recusada; nova tentativa agendada', { transferId: t.id, storeId: t.storeId, attempts: t.attempts });
  return 'failed';
}

async function markUncertain(t: AlertRow, reason: string, err?: unknown): Promise<void> {
  const { count } = await prisma.motoboyTransfer.updateMany({
    where: { id: t.id, status: 'requested' },
    data: { status: 'uncertain', lastError: reason },
  });
  if (count !== 1) return;
  logger.error('[motoboyTransfer] resposta incerta do Asaas — NÃO reenviar sem conferir no Asaas', (err as Error) ?? new Error(reason), { transferId: t.id, storeId: t.storeId });
  alertAdmin(t, 'Pix ao motoboy com resposta incerta', 'conferir no Asaas antes de qualquer reenvio.');
}

type HoldError = 'DAILY_LIMIT' | 'AUTH_WEBHOOK_NOT_CONFIRMED' | 'MOTOBOY_PIX_KEY_MISSING';
type Claim =
  | { kind: 'skip' }
  | { kind: 'limited'; row: MotoboyTransfer; error: HoldError | 'AMOUNT_OVER_LIMIT'; firstTime: boolean }
  | { kind: 'claimed'; row: MotoboyTransfer };

/** Revisão da trava de autorização não confirmada (R14). */
const HOLD_RETRY_MS = 60 * 60 * 1000;

/**
 * Motivos de falha que NÃO são culpa da loja (R15): não contam para o bloqueio do aceite.
 * AUTH_WEBHOOK_NOT_CONFIRMED conta (a loja precisa confirmar a trava).
 */
export const NON_STORE_TRANSFER_ERRORS = ['DAILY_LIMIT', 'MOTOBOY_PIX_KEY_MISSING', 'AMOUNT_OVER_LIMIT'];

/**
 * lastError seguro (m4): o `code` do Asaas e a descrição com e-mails, UUIDs (EVP) e dígitos
 * mascarados — a descrição do Asaas pode ecoar a chave Pix.
 */
function safeErrorText(err: unknown): string {
  if (err instanceof AsaasApiError) {
    const e = err.errors?.[0];
    const code = e?.code || `HTTP_${err.status}`;
    const desc = maskSensitiveText(e?.description);
    return desc ? `${code}: ${desc}` : code;
  }
  return (err as Error)?.message || 'erro'; // StorePaymentsNotReadyError: mensagem nossa
}

/**
 * Envia a transferência ao Asaas com a chave DA LOJA (POST /transfers).
 *
 *  1. Claim atômico `pending|failed` (vencida) → `requested` sob trava consultiva por loja,
 *     que também serializa a checagem do teto diário (P10) entre execuções concorrentes.
 *  2. Sucesso HTTP NÃO é `done`: fica `requested` até o webhook TRANSFER_DONE.
 *  3. 4xx / loja sem conta → `failed` com backoff P5; timeout, rede, 5xx → `uncertain`
 *     (R6: nunca reenviado automaticamente).
 *
 * Desligado (`directTransfersEnabled=false`) → não faz nada (fail closed) e devolve 'skipped'.
 * Nunca loga a chave da loja nem a chave Pix.
 */
export async function sendTransfer(transferId: string, now: Date = new Date()): Promise<MotoboyTransferStatus | 'skipped'> {
  const cfg = await getSaasConfig();
  const current = await prisma.motoboyTransfer.findUnique({ where: { id: transferId } });
  if (!current) throw new Error(`MotoboyTransfer ${transferId} não encontrada`);
  if (!cfg.directTransfersEnabled) return 'skipped';

  const claim: Claim = await prisma.$transaction(async (tx) => {
    const lockKey = `motoboy-transfer:${current.storeId}`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const t = await tx.motoboyTransfer.findUnique({ where: { id: transferId } });
    if (!t || !['pending', 'failed'].includes(t.status) || t.nextAttemptAt.getTime() > now.getTime()) {
      return { kind: 'skip' };
    }

    if (cents(t.amount) > cents(cfg.directTransferMaxAmount)) {
      const { count } = await tx.motoboyTransfer.updateMany({
        where: { id: t.id, status: t.status },
        data: { status: 'failed_final', lastError: 'AMOUNT_OVER_LIMIT' },
      });
      return count === 1 ? { kind: 'limited', row: t, error: 'AMOUNT_OVER_LIMIT', firstTime: true } : { kind: 'skip' };
    }

    // Retenções que NÃO gastam tentativa: a linha volta a `failed` com o motivo e é revista
    // em `nextAttemptAt`. `firstTime` evita repetir o alerta a cada volta do job.
    const hold = async (error: HoldError, nextAttemptAt: Date): Promise<Claim> => {
      const { count } = await tx.motoboyTransfer.updateMany({
        where: { id: t.id, status: t.status },
        data: { status: 'failed', lastError: error, nextAttemptAt },
      });
      return count === 1 ? { kind: 'limited', row: t, error, firstTime: t.lastError !== error } : { kind: 'skip' };
    };

    // R14: sem a trava de autorização (2.2) confirmada na conta da loja, nada sai.
    const acct = await tx.storeAsaasAccount.findUnique({ where: { storeId: t.storeId }, select: { authWebhookConfirmedAt: true } });
    if (!acct?.authWebhookConfirmedAt) return hold('AUTH_WEBHOOK_NOT_CONFIRMED', new Date(now.getTime() + HOLD_RETRY_MS));

    // Chave Pix ausente no snapshot: tira o snapshot da chave atual do motoboy (como na 2.1);
    // sem chave, espera o cadastro sem gastar tentativa.
    let keyPatch: { pixKeyEncrypted: string; pixKeyType: string } | null = null;
    if (!t.pixKeyEncrypted) {
      const snap = await motoboyPixSnapshot(tx, t.motoboyId);
      if (!snap.pixKey) return hold('MOTOBOY_PIX_KEY_MISSING', new Date(now.getTime() + MOTOBOY_TRANSFER_BACKOFF_MS[0]));
      keyPatch = { pixKeyEncrypted: encryptSensitiveData(snap.pixKey), pixKeyType: snap.pixKeyType };
    }

    // P10: o que já saiu (ou pode ter saído) hoje, desta loja. `uncertain` conta, porque o
    // dinheiro pode ter saído. Dia civil de São Paulo, pela última mudança da linha.
    const today = await tx.motoboyTransfer.aggregate({
      where: {
        storeId: t.storeId, id: { not: t.id }, status: { in: ['requested', 'done', 'uncertain'] },
        updatedAt: { gte: saoPauloDayStart(now) },
      },
      _sum: { amount: true },
    });
    if (cents(today._sum.amount ?? 0) + cents(t.amount) > cents(cfg.directTransferDailyMaxPerStore)) {
      return hold('DAILY_LIMIT', new Date(saoPauloDayStart(now).getTime() + DAY_MS)); // próximo dia de SP
    }

    // Nova tentativa = nova transferência no Asaas. O id da anterior vai para
    // `previousAsaasTransferIds` (R13): evento atrasado dele é ignorado e a autorização (2.2)
    // o recusa; o vínculo e a autorização são zerados para o id novo.
    const { count } = await tx.motoboyTransfer.updateMany({
      where: { id: t.id, status: { in: ['pending', 'failed'] }, nextAttemptAt: { lte: now }, asaasTransferId: t.asaasTransferId },
      data: {
        status: 'requested', attempts: { increment: 1 }, asaasTransferId: null, authorizedAt: null, lastError: null,
        ...(t.asaasTransferId ? { previousAsaasTransferIds: { push: t.asaasTransferId } } : {}),
        ...(keyPatch ?? {}),
      },
    });
    if (count !== 1) return { kind: 'skip' };
    return { kind: 'claimed', row: (await tx.motoboyTransfer.findUnique({ where: { id: t.id } }))! };
  });

  if (claim.kind === 'skip') return 'skipped'; // outra execução pegou, não venceu ou já terminou
  if (claim.kind === 'limited') {
    const r = claim.row;
    if (claim.error === 'AMOUNT_OVER_LIMIT') {
      alertAdmin(r, 'Transferência ao motoboy acima do limite', 'acima do teto por transferência; requer análise.');
      return 'failed_final';
    }
    logger.warn('[motoboyTransfer] transferência retida (sem gastar tentativa)', { transferId: r.id, storeId: r.storeId, reason: claim.error });
    if (claim.firstTime && claim.error === 'DAILY_LIMIT') {
      alertAdmin(r, 'Pix ao motoboy retido pelo teto diário', `a loja atingiu R$ ${brl(cfg.directTransferDailyMaxPerStore)} no dia; nova tentativa amanhã.`);
    } else if (claim.firstTime && claim.error === 'AUTH_WEBHOOK_NOT_CONFIRMED') {
      alertAdmin(r, 'Pix ao motoboy retido: loja sem trava de autorização', 'a loja não confirmou o webhook de autorização de transferências no Asaas.');
    }
    return 'failed';
  }

  const t = claim.row;
  let pixKey = '';
  try {
    pixKey = t.pixKeyEncrypted ? decryptSensitiveData(t.pixKeyEncrypted) : '';
  } catch {
    return (await registerFailure(t, 'PIX_KEY_UNREADABLE', ['requested'], now)) ?? 'skipped';
  }
  if (!pixKey) return (await registerFailure(t, 'MOTOBOY_PIX_KEY_MISSING', ['requested'], now)) ?? 'skipped';

  let response: any;
  try {
    const apiKey = await storeKey(t.storeId); // conta ausente/inválida → falha definida, nada enviado
    try {
      response = await asaasClient.postAs(apiKey, '/transfers', {
        value: Number(t.amount),
        operationType: 'PIX',
        pixAddressKey: pixKey,
        pixAddressKeyType: t.pixKeyType,
        externalReference: t.id,
        description: `DROP entrega ${String(t.orderId).slice(0, 6)}`,
      });
    } catch (err) {
      throw await translate(t.storeId, err);
    }
  } catch (err) {
    const definite = err instanceof StorePaymentsNotReadyError
      || (err instanceof AsaasApiError && err.status >= 400 && err.status < 500 && err.status !== 408);
    if (definite) {
      return (await registerFailure(t, safeErrorText(err), ['requested'], now)) ?? 'skipped';
    }
    // R6: incerta fica para o admin. A consulta da transferência por externalReference antes
    // de reenviar depende de endpoint ainda não confirmado no sandbox — até lá, sem consulta.
    await markUncertain(t, 'UNCERTAIN', err);
    return 'uncertain';
  }

  const asaasId = typeof response?.id === 'string' ? response.id : '';
  if (!asaasId) {
    await markUncertain(t, 'UNCERTAIN_NO_ID');
    return 'uncertain';
  }
  // Grava o id do Asaas sem sobrescrever outro já vinculado (a autorização da 2.2 pode ter
  // chegado antes) e sem tocar em authorizedAt. `done` só pelo webhook.
  const { count } = await prisma.motoboyTransfer.updateMany({
    where: { id: t.id, OR: [{ asaasTransferId: null }, { asaasTransferId: asaasId }] },
    data: { asaasTransferId: asaasId },
  });
  if (count !== 1) {
    logger.error('[motoboyTransfer] id do Asaas diferente do já vinculado', new Error('ASAAS_ID_MISMATCH'), { transferId: t.id, storeId: t.storeId });
    alertAdmin(t, 'Pix ao motoboy com id divergente', 'o Asaas devolveu outro id de transferência; conferir no Asaas.');
  }
  logger.info('[motoboyTransfer] transferência enviada ao Asaas', { transferId: t.id, storeId: t.storeId, attempts: t.attempts });
  return 'requested';
}

/**
 * Webhook da conta da loja: TRANSFER_DONE / TRANSFER_FAILED / TRANSFER_CANCELLED.
 * Identifica pela externalReference (= MotoboyTransfer.id), senão pelo asaasTransferId, sempre
 * dentro da loja do webhook. `done` nunca regride; referência desconhecida é ignorada.
 */
export async function reconcileTransferFromWebhook(storeId: string, event: string, transfer: any): Promise<void> {
  const ref = typeof transfer?.externalReference === 'string' ? transfer.externalReference.trim() : '';
  const asaasId = typeof transfer?.id === 'string' ? transfer.id.trim() : '';
  const t = ref
    ? await prisma.motoboyTransfer.findFirst({ where: { id: ref, storeId } })
    : asaasId ? await prisma.motoboyTransfer.findFirst({ where: { asaasTransferId: asaasId, storeId } }) : null;
  if (!t) {
    logger.warn('[motoboyTransfer] webhook de transferência sem MotoboyTransfer correspondente (ignorado)', { storeId, event, asaasTransferId: asaasId || null });
    return;
  }
  if (asaasId && (t.previousAsaasTransferIds ?? []).includes(asaasId)) {
    // R13: evento atrasado de uma tentativa ANTERIOR — nunca conclui a tentativa atual.
    logger.warn('[motoboyTransfer] webhook de transferência anterior (ignorado)', { transferId: t.id, storeId, event });
    if (event === 'TRANSFER_DONE') {
      // I3: o Pix anterior SAIU. Trava a linha (uncertain) para o job não reenviar e a trava de
      // autorização (só aprova `requested`) recusar a tentativa nova ainda não autorizada. Se a
      // nova já foi autorizada, o dinheiro pode ter saído em dobro: só alerta, o admin resolve.
      await prisma.motoboyTransfer.updateMany({
        where: {
          id: t.id,
          OR: [{ status: 'requested', authorizedAt: null }, { status: { in: ['pending', 'failed'] } }],
        },
        data: { status: 'uncertain', lastError: 'PREVIOUS_DONE' },
      });
      alertAdmin(t, 'Pix ao motoboy: tentativa anterior concluída', 'uma transferência dada como falha foi concluída no Asaas; risco de pagamento em dobro — conferir.');
    }
    return;
  }
  if (asaasId && t.asaasTransferId && t.asaasTransferId !== asaasId) {
    logger.error('[motoboyTransfer] webhook com id do Asaas diferente do vinculado (ignorado)', new Error('ASAAS_ID_MISMATCH'), { transferId: t.id, storeId, event });
    alertAdmin(t, 'Pix ao motoboy com id divergente', `evento ${event} de outra transferência no Asaas; conferir.`);
    return;
  }

  if (event === 'TRANSFER_DONE') {
    // Fail closed (I2): sem o id do Asaas não há como provar que é ESTA transferência.
    if (!asaasId) {
      logger.warn('[motoboyTransfer] TRANSFER_DONE sem transfer.id (ignorado)', { transferId: t.id, storeId });
      if (t.status !== 'done') alertAdmin(t, 'Pix ao motoboy: conclusão sem id do Asaas', 'evento TRANSFER_DONE sem id da transferência; conferir no Asaas.');
      return;
    }
    if (t.status === 'done') return; // idempotente
    // DONE só de quem está em voo/incerto, ou de `failed` com o MESMO id vinculado.
    const boundSame = t.asaasTransferId === asaasId;
    const accepts = t.status === 'requested' || t.status === 'uncertain' || (t.status === 'failed' && boundSame);
    if (!accepts) {
      logger.warn('[motoboyTransfer] TRANSFER_DONE em status que não aceita conclusão (ignorado)', { transferId: t.id, storeId, status: t.status });
      alertAdmin(t, 'Pix ao motoboy concluído fora de hora', `o Asaas concluiu uma transferência com a linha em ${t.status}; conferir (risco de pagamento em dobro).`);
      return;
    }
    const { count } = await prisma.motoboyTransfer.updateMany({
      where: {
        id: t.id,
        ...(t.status === 'failed'
          ? { status: 'failed', asaasTransferId: asaasId }
          : { status: { in: ['requested', 'uncertain'] }, OR: [{ asaasTransferId: null }, { asaasTransferId: asaasId }] }),
        NOT: { previousAsaasTransferIds: { has: asaasId } },
      },
      data: { status: 'done', doneAt: new Date(), lastError: null, asaasTransferId: asaasId },
    });
    if (count === 1) {
      logger.info('[motoboyTransfer] transferência concluída', { transferId: t.id, storeId });
      emitToRoom(`user:${t.motoboyId}`, 'motoboy:transfer_done', { transferId: t.id, orderId: t.orderId, amount: Number(t.amount) });
    }
    return;
  }

  // FAILED / CANCELLED: só o que estava em voo (requested) ou incerto vira falha com retentativa.
  await registerFailure(t, event, ['requested', 'uncertain'], new Date(), asaasId || undefined);
}

/**
 * Loja com Pix ao motoboy em `failed`/`failed_final` há mais de `transferBlockHours`, por
 * motivo da própria loja e com o envio ligado.
 * Idade medida por `createdAt` (momento da entrega = desde quando o motoboy espera): o
 * `updatedAt` é renovado a cada retentativa (backoff ≤ 6 h) e nunca envelheceria 24 h.
 */
export async function storeHasOverdueTransfer(storeId: string, now: Date = new Date()): Promise<boolean> {
  const { transferBlockHours, directTransfersEnabled } = await getSaasConfig();
  if (!directTransfersEnabled) return false; // R15: com o envio desligado a loja não tem como pagar
  const n = await prisma.motoboyTransfer.count({
    where: {
      storeId,
      status: { in: ['failed', 'failed_final'] },
      createdAt: { lt: new Date(now.getTime() - transferBlockHours * 60 * 60 * 1000) },
      // R15: motivos fora do controle da loja não bloqueiam (lastError nulo conta).
      OR: [{ lastError: null }, { lastError: { notIn: NON_STORE_TRANSFER_ERRORS } }],
    },
  });
  return n > 0;
}
