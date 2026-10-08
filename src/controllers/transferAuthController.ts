import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { verifyStoreWebhookToken } from '../services/asaasLoja/webhook';
import { decryptSensitiveData } from '../utils/encryption';

/**
 * Webhook de autorização de saques/transferências do Asaas ("Mecanismo para validação de
 * saque via webhooks"). FECHADO POR PADRÃO: a DROP só aprova o que ela mesma pediu
 * (MotoboyTransfer / DirectRefund em `requested`, mesma loja, mesmo valor, mesma chave).
 * Sempre HTTP 200 com { status: 'APPROVED' } ou { status: 'REFUSED', refuseReason }.
 * Qualquer exceção interna vira REFUSED. Nunca logar chave Pix nem token.
 */

export type AuthRequest =
  | { kind: 'transfer'; transferId: string; asaasId: string; valueCents: number | null; pixKey: string }
  | { kind: 'pixRefund'; paymentId: string; valueCents: number | null }
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
    return { kind: 'pixRefund', paymentId: str(pay && typeof pay === 'object' ? (pay as any).id : pay), valueCents: toCents(r.value) };
  }
  return { kind: 'unsupported', type };
}

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

async function decidePixRefund(storeId: string, req: Extract<AuthRequest, { kind: 'pixRefund' }>): Promise<Decision> {
  if (!req.paymentId) return refuse('UNKNOWN_REFUND');
  const r = await prisma.directRefund.findFirst({ where: { storeId, asaasPaymentId: req.paymentId, status: 'requested' } });
  if (!r) return refuse('UNKNOWN_REFUND');
  if (req.valueCents === null || req.valueCents !== Math.round(Number(r.amount) * 100)) return refuse('AMOUNT_MISMATCH', r.id);
  return { approved: true, transferId: r.id };
}

export const handleTransferAuthorization = async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId || '');
  let decision: Decision = refuse('INTERNAL_ERROR');
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
