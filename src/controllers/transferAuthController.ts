import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { verifyStoreWebhookToken } from '../services/asaasLoja/webhook';
import { decryptSensitiveData } from '../utils/encryption';
import env from '../config/env';

/**
 * Webhook de autorização de saques/transferências do Asaas ("Mecanismo para validação de
 * saque via webhooks"). FECHADO POR PADRÃO: a DROP só aprova o que ela mesma pediu
 * (MotoboyTransfer em `requested` / DirectRefund em `requested` ou `done` recente, mesma loja,
 * mesmo valor, mesma chave), vinculando uma única vez.
 * Sempre HTTP 200 com { status: 'APPROVED' } ou { status: 'REFUSED', refuseReason }.
 * Qualquer exceção interna vira REFUSED. Nunca logar chave Pix nem token.
 */

export type AuthRequest =
  | { kind: 'transfer'; transferId: string; asaasId: string; valueCents: number | null; pixKey: string }
  | { kind: 'pixRefund'; paymentId: string; valueCents: number | null; refundId?: string }
  | { kind: 'unsupported'; type: string }
  | { kind: 'invalid' };

const toCents = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/**
 * Lê o corpo da autorização. CONFIRMAR NO SANDBOX: o formato exato do Asaas ainda não foi
 * verificado; aceitamos variações razoáveis (type em qualquer caixa, pixRefund.payment ou
 * .paymentId, chave em transfer.pixAddressKey ou transfer.bankAccount.pixAddressKey).
 * Fixture com o formato assumido: src/tests/fixtures/asaas-transfer-auth.json.
 */
export function parseAuthorizationRequest(body: any): AuthRequest {
  if (!body || typeof body !== 'object') return { kind: 'invalid' };
  const type = str(body.type).toUpperCase();
  if (type === 'TRANSFER') {
    const t = body.transfer;
    if (!t || typeof t !== 'object') return { kind: 'invalid' };
    return {
      kind: 'transfer',
      transferId: str(t.externalReference),
      asaasId: str(t.id),
      valueCents: toCents(t.value),
      pixKey: str(t.pixAddressKey) || str(t.bankAccount?.pixAddressKey),
    };
  }
  if (type === 'PIX_REFUND') {
    const r = body.pixRefund;
    if (!r || typeof r !== 'object') return { kind: 'invalid' };
    const pay = r.paymentId ?? r.payment;
    // id do estorno no Asaas (CONFIRMAR NO SANDBOX o nome do campo): vincula a autorização.
    const refundId = str(r.id ?? r.refundId);
    return {
      kind: 'pixRefund',
      paymentId: str(pay && typeof pay === 'object' ? (pay as any).id : pay),
      valueCents: toCents(r.value),
      ...(refundId ? { refundId } : {}),
    };
  }
  return { kind: 'unsupported', type };
}

/** Campos do corpo da autorização que saem no log como vieram (ids, valores e status). */
const SHAPE_PLAIN_KEYS = new Set([
  'type', 'id', 'transferId', 'externalReference', 'payment', 'paymentId', 'refundId', 'status',
  'operationType', 'dateCreated', 'effectiveDate', 'scheduleDate', 'canBeCancelled', 'refundDisabledReason',
]);

/**
 * Formato do corpo da autorização para o log do sandbox: mantém todos os nomes de campo,
 * números, booleanos e os campos de SHAPE_PLAIN_KEYS; qualquer outro texto (chave Pix,
 * documento, nome, conta) sai mascarado.
 */
export function authPayloadShape(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => authPayloadShape(v, key));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = authPayloadShape(v, k);
    return out;
  }
  if (typeof value === 'string') {
    if (SHAPE_PLAIN_KEYS.has(key)) return value;
    return value ? `*** (${value.length})` : value;
  }
  return value;
}

const isAsaasSandbox = () => String(env.ASAAS_API_URL || '').includes('sandbox');

/** Normaliza chave Pix: e-mail minúsculo; CPF/CNPJ/telefone só dígitos; demais (EVP) minúsculo. */
export function normalizePixKey(key: string): string {
  const k = String(key ?? '').trim();
  if (k.includes('@')) return k.toLowerCase();
  if (/^[\d.\-/\s()+]+$/.test(k)) return k.replace(/\D/g, '');
  return k.toLowerCase();
}

function samePixKey(a: string, b: string, snapshotType?: string): boolean {
  const x = normalizePixKey(a);
  const y = normalizePixKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // DDI 55 só é tolerado quando o snapshot é telefone (CPF/CNPJ nunca casam por prefixo)
  if (String(snapshotType ?? '').toUpperCase() !== 'PHONE') return false;
  return (x === `55${y}` && y.length >= 10 && y.length <= 11) || (y === `55${x}` && x.length >= 10 && x.length <= 11);
}

type Decision = { approved: boolean; reason?: string; transferId?: string | null };
const refuse = (reason: string, transferId?: string | null): Decision => ({ approved: false, reason, transferId });

async function decideTransfer(storeId: string, req: Extract<AuthRequest, { kind: 'transfer' }>): Promise<Decision> {
  if (!req.transferId) return refuse('UNKNOWN_TRANSFER');
  if (!req.asaasId) return refuse('INVALID_REQUEST', req.transferId);
  const t = await prisma.motoboyTransfer.findUnique({ where: { id: req.transferId } });
  if (!t) return refuse('UNKNOWN_TRANSFER', req.transferId);
  if (t.storeId !== storeId) return refuse('STORE_MISMATCH', t.id);
  if (t.status !== 'requested') return refuse('INVALID_STATUS', t.id);
  // Id de uma tentativa anterior (já dada como falha e substituída): nunca aprovar.
  if ((t.previousAsaasTransferIds ?? []).includes(req.asaasId)) return refuse('PREVIOUS_TRANSFER', t.id);
  if (req.valueCents === null || req.valueCents !== Math.round(Number(t.amount) * 100)) return refuse('AMOUNT_MISMATCH', t.id);
  let snapshot = '';
  try {
    snapshot = t.pixKeyEncrypted ? decryptSensitiveData(t.pixKeyEncrypted) : '';
  } catch {
    return refuse('PIX_KEY_UNREADABLE', t.id);
  }
  if (!samePixKey(req.pixKey, snapshot, t.pixKeyType)) return refuse('PIX_KEY_MISMATCH', t.id);

  // Vincula a autorização ao id da transferência do Asaas: uma segunda transferência
  // (id diferente) para a mesma referência nunca é aprovada. Retry do MESMO id é idempotente.
  const upd = await prisma.motoboyTransfer.updateMany({
    where: {
      id: t.id,
      status: 'requested',
      authorizedAt: null,
      OR: [{ asaasTransferId: null }, { asaasTransferId: req.asaasId }],
      NOT: { previousAsaasTransferIds: { has: req.asaasId } },
    },
    data: { authorizedAt: new Date(), asaasTransferId: req.asaasId },
  });
  if (upd.count !== 1) {
    const again = await prisma.motoboyTransfer.findUnique({ where: { id: t.id }, select: { status: true, authorizedAt: true, asaasTransferId: true } });
    if (!again || again.status !== 'requested') return refuse('INVALID_STATUS', t.id);
    if (!(again.authorizedAt && again.asaasTransferId === req.asaasId)) return refuse('ALREADY_AUTHORIZED', t.id);
  }
  return { approved: true, transferId: t.id };
}

/** Janela em que um estorno já dado como `done` ainda aceita a autorização do Asaas (R20). */
export const REFUND_AUTH_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * R20: o Asaas pode pedir a autorização DEPOIS de a DROP ter registrado o 200 do POST /refund
 * (linha já `done`). Aprova `requested` ou `done` recente (≤ 24 h), mesma loja, mesmo pagamento,
 * mesmo valor — e vincula uma única vez (authorizedAt + id do estorno no Asaas): outro id é
 * recusado (ALREADY_AUTHORIZED); o mesmo id (retry) é aprovado de novo.
 */
async function decidePixRefund(storeId: string, req: Extract<AuthRequest, { kind: 'pixRefund' }>): Promise<Decision> {
  if (!req.paymentId) return refuse('UNKNOWN_REFUND');
  const eligible = () => ({
    OR: [
      { status: 'requested' },
      { status: 'done', doneAt: { gte: new Date(Date.now() - REFUND_AUTH_DONE_WINDOW_MS) } },
    ],
  });
  const r = await prisma.directRefund.findFirst({ where: { storeId, asaasPaymentId: req.paymentId, ...eligible() } });
  if (!r) return refuse('UNKNOWN_REFUND');
  if (req.valueCents === null || req.valueCents !== Math.round(Number(r.amount) * 100)) return refuse('AMOUNT_MISMATCH', r.id);

  const refundId = req.refundId || null;
  const upd = await prisma.directRefund.updateMany({
    where: { id: r.id, authorizedAt: null, ...eligible() },
    data: { authorizedAt: new Date(), ...(refundId ? { asaasRefundId: refundId } : {}) },
  });
  if (upd.count !== 1) {
    const again = await prisma.directRefund.findFirst({ where: { id: r.id, ...eligible() }, select: { authorizedAt: true, asaasRefundId: true } });
    if (!again) return refuse('INVALID_STATUS', r.id);
    // Retry idempotente: mesmo id do estorno (ou, sem id no corpo, autorização anterior também sem id).
    if (!(again.authorizedAt && (again.asaasRefundId ?? null) === refundId)) return refuse('ALREADY_AUTHORIZED', r.id);
  }
  return { approved: true, transferId: r.id };
}

export const handleTransferAuthorization = async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId || '');
  let decision: Decision = refuse('INTERNAL_ERROR');
  // Só no sandbox: o formato real do corpo ainda precisa ser confirmado (ver fixture).
  if (isAsaasSandbox()) {
    logger.info('[transfer-auth][sandbox] corpo recebido', { storeId, body: authPayloadShape(req.body) });
  }
  try {
    const tokenOk = await verifyStoreWebhookToken(storeId, req.header('asaas-access-token'), 'auth');
    if (!tokenOk) {
      decision = refuse('INVALID_TOKEN');
    } else {
      const parsed = parseAuthorizationRequest(req.body);
      if (parsed.kind === 'transfer') decision = await decideTransfer(storeId, parsed);
      else if (parsed.kind === 'pixRefund') decision = await decidePixRefund(storeId, parsed);
      else if (parsed.kind === 'unsupported') decision = refuse('UNSUPPORTED_TYPE');
      else decision = refuse('INVALID_REQUEST');
    }
  } catch (err) {
    logger.error('[transfer-auth] erro interno (REFUSED)', err as Error, { storeId });
    decision = refuse('INTERNAL_ERROR');
  }
  logger.info('[transfer-auth]', {
    storeId,
    transferId: decision.transferId ?? null,
    decision: decision.approved ? 'APPROVED' : 'REFUSED',
    reason: decision.reason ?? null,
  });
  return res.status(200).json(decision.approved ? { status: 'APPROVED' } : { status: 'REFUSED', refuseReason: decision.reason });
};
