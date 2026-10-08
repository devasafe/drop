import { Response } from 'express';
import { z } from 'zod';
import { MotoboyTransfer } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';
import { isStoreOwner } from '../utils/storeOwnership';
import { decryptSensitiveData } from '../utils/encryption';
import { maskPixKey } from '../services/asaasLoja/motoboyTransfer';
import { storeSafeLastError } from '../utils/safeErrorText';
import { parseCursorPage, sliceCursorPage } from '../utils/cursorPagination';

/** Sem `limit`, cada lista devolve o mesmo tamanho de antes da paginação; teto de 200. */
const MAX_LIMIT = 200;

/** Task 2.4 — visões das transferências Pix da loja ao motoboy (modo direto). */

export const resolveTransferSchema = z.object({
  note: z.string().trim().min(10, 'Informe uma nota com pelo menos 10 caracteres'),
});

/** Chave mascarada a partir do snapshot cifrado; falha de decifragem → vazio (fail closed). */
function maskedKey(t: Pick<MotoboyTransfer, 'pixKeyEncrypted' | 'pixKeyType'>): string {
  if (!t.pixKeyEncrypted) return '';
  try {
    return maskPixKey(decryptSensitiveData(t.pixKeyEncrypted), t.pixKeyType || undefined);
  } catch {
    return '';
  }
}

/** Visão do motoboy: sem erro interno e sem chave. */
function serializeForMotoboy(t: MotoboyTransfer) {
  return { id: t.id, orderId: t.orderId, amount: Number(t.amount), status: t.status, reason: t.reason, doneAt: t.doneAt, createdAt: t.createdAt };
}

/** Visão da loja/admin: chave só mascarada; nunca o snapshot cifrado nem o id do Asaas. */
function serialize(t: MotoboyTransfer) {
  return {
    id: t.id,
    orderId: t.orderId,
    storeId: t.storeId,
    motoboyId: t.motoboyId,
    reason: t.reason,
    amount: Number(t.amount),
    status: t.status,
    attempts: t.attempts,
    lastError: t.lastError,
    nextAttemptAt: t.nextAttemptAt,
    pixKeyMasked: maskedKey(t),
    resolvedBy: t.resolvedBy,
    resolutionNote: t.resolutionNote,
    doneAt: t.doneAt,
    createdAt: t.createdAt,
  };
}

/** Visão da LOJA (M3): sem a resolução interna do admin e com lastError só code/mascarado. */
function serializeForStore(t: MotoboyTransfer) {
  const { resolvedBy: _rb, resolutionNote: _rn, ...rest } = serialize(t);
  void _rb; void _rn;
  return { ...rest, lastError: storeSafeLastError(t.lastError) };
}

async function withNames<T extends { storeId: string; motoboyId: string }>(rows: T[]) {
  const [stores, users] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.storeId))] } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.motoboyId))] } }, select: { id: true, name: true } }),
  ]);
  const sn = new Map(stores.map((s) => [s.id, s.name]));
  const un = new Map(users.map((u) => [u.id, u.name]));
  return { storeName: (id: string) => sn.get(id) ?? null, motoboyName: (id: string) => un.get(id) ?? null };
}

/** GET /api/motoboy/transfers — SEMPRE os do usuário autenticado. */
export async function listMyTransfers(req: any, res: Response) {
  const page = parseCursorPage(req.query, { defaultLimit: 100, maxLimit: MAX_LIMIT });
  const rows = await prisma.motoboyTransfer.findMany({
    where: { AND: [{ motoboyId: String(req.user.id) }, page.where] },
    orderBy: page.orderBy,
    take: page.take,
  });
  const { items, nextCursor } = sliceCursorPage(rows, page);
  return res.json({ success: true, data: items.map(serializeForMotoboy), nextCursor });
}

/** GET /api/stores/:storeId/transfers — só o dono da loja. */
export async function listStoreTransfers(req: any, res: Response) {
  const storeId = String(req.params.storeId);
  if (!(await isStoreOwner(storeId, req.user?.id))) throw new AppError('Sem permissão para esta loja', 403, true, 'FORBIDDEN');
  const page = parseCursorPage(req.query, { defaultLimit: 100, maxLimit: MAX_LIMIT });
  const rows = await prisma.motoboyTransfer.findMany({ where: { AND: [{ storeId }, page.where] }, orderBy: page.orderBy, take: page.take });
  const { items, nextCursor } = sliceCursorPage(rows, page);
  const names = await withNames(items);
  return res.json({
    success: true,
    data: items.map((r) => ({ ...serializeForStore(r), motoboyName: names.motoboyName(r.motoboyId) })),
    nextCursor,
  });
}

/** GET /api/admin/transfers?status= */
export async function listAdminTransfers(req: any, res: Response) {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const page = parseCursorPage(req.query, { defaultLimit: 200, maxLimit: MAX_LIMIT });
  const rows = await prisma.motoboyTransfer.findMany({
    where: { AND: [status ? { status } : {}, page.where] },
    orderBy: page.orderBy,
    take: page.take,
  });
  const { items, nextCursor } = sliceCursorPage(rows, page);
  const names = await withNames(items);
  return res.json({
    success: true,
    data: items.map((r) => ({ ...serialize(r), storeName: names.storeName(r.storeId), motoboyName: names.motoboyName(r.motoboyId) })),
    nextCursor,
  });
}

/**
 * POST /api/admin/transfers/:id/retry — reabre `failed`/`failed_final`: volta a `failed`,
 * vencida agora e com a escada de tentativas zerada. Só reagenda; quem envia é o job (e só
 * com `directTransfersEnabled`). `uncertain` NUNCA é reenviada: o dinheiro pode ter saído.
 */
export async function retryTransfer(req: any, res: Response) {
  const id = String(req.params.id);
  const t = await prisma.motoboyTransfer.findUnique({ where: { id } });
  if (!t) throw new AppError('Transferência não encontrada', 404, true, 'TRANSFER_NOT_FOUND');
  const { count } = await prisma.motoboyTransfer.updateMany({
    where: { id, status: { in: ['failed', 'failed_final'] } },
    data: { status: 'failed', attempts: 0, nextAttemptAt: new Date() },
  });
  if (count !== 1) {
    const code = t.status === 'uncertain' ? 'TRANSFER_UNCERTAIN' : t.status === 'done' ? 'TRANSFER_ALREADY_DONE' : 'TRANSFER_NOT_RETRYABLE';
    const msg = t.status === 'uncertain'
      ? 'Resultado incerto: confira no Asaas e use "Marcar como resolvido"'
      : t.status === 'done' ? 'Esta transferência já foi concluída' : 'Esta transferência não pode ser reenviada agora';
    throw new AppError(msg, 409, true, code);
  }
  logger.info('[motoboyTransfer][AUDIT]', { transferId: id, adminId: req.user?.id, action: 'retry', from: t.status });
  const fresh = await prisma.motoboyTransfer.findUnique({ where: { id } });
  return res.json({ success: true, data: serialize(fresh!) });
}

/** POST /api/admin/transfers/:id/resolve — o admin conferiu no Asaas e marca como concluída. */
export async function resolveTransfer(req: any, res: Response) {
  const id = String(req.params.id);
  const adminId = String(req.user?.id);
  const { note } = req.body as z.infer<typeof resolveTransferSchema>;
  const t = await prisma.motoboyTransfer.findUnique({ where: { id } });
  if (!t) throw new AppError('Transferência não encontrada', 404, true, 'TRANSFER_NOT_FOUND');

  // Autor e nota gravados na mesma escrita condicional do estado terminal.
  const { count } = await prisma.motoboyTransfer.updateMany({
    where: { id, status: { in: ['failed', 'failed_final', 'uncertain'] } },
    data: { status: 'done', doneAt: new Date(), lastError: null, resolvedBy: `admin:${adminId}`, resolutionNote: note },
  });
  if (count !== 1) {
    const done = t.status === 'done';
    throw new AppError(
      done ? 'Esta transferência já foi concluída' : 'Esta transferência não pode ser resolvida agora',
      409, true, done ? 'TRANSFER_ALREADY_DONE' : t.status === 'requested' ? 'TRANSFER_IN_PROGRESS' : 'TRANSFER_NOT_RESOLVABLE',
    );
  }
  logger.info('[motoboyTransfer][AUDIT]', { transferId: id, adminId, action: 'resolve', from: t.status, note });
  const fresh = await prisma.motoboyTransfer.findUnique({ where: { id } });
  return res.json({ success: true, data: serialize(fresh!) });
}
