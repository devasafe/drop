import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';
import { ApiKeyRequest } from '../middleware/storeApiKey';
import { generateApiKey, generateWebhookSecret, sendTestWebhook } from '../services/storeIntegration';
import { checkWebhookUrl } from '../utils/ssrfGuard';

/** Resolve a loja do lojista logado. */
async function resolveStore(userId?: string) {
  if (!userId) return null;
  return prisma.store.findFirst({ where: { ownerId: userId } });
}

/* ─────────────────────────  A — PULL (API key)  ───────────────────────── */

/** Escapa uma célula CSV (aspas/vírgula/quebra) + anti formula-injection: uma
 *  célula começando com = + - @ TAB CR é prefixada com `'` (não executa no Excel). */
export function csvEscape(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /integrations/v1/products — estoque da loja (JSON ou CSV). Suporta
 * paginação (`?limit`, `?after=<id>`) e pull incremental (`?updated_since=<ISO>`
 * — só o que mudou desde então). "Tempo real" = sempre o dado atual do banco.
 */
export const listProductsForIntegration = async (req: ApiKeyRequest, res: Response) => {
  const storeId = req.integrationStoreId;
  if (!storeId) return res.status(401).json({ error: 'Não autenticado' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
  const after = typeof req.query.after === 'string' && req.query.after ? req.query.after : undefined;
  const since = typeof req.query.updated_since === 'string' ? new Date(req.query.updated_since) : null;

  const where: any = { storeId };
  if (since && !Number.isNaN(since.getTime())) where.updatedAt = { gte: since };

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, quantity: true, price: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take: limit,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });

  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    price: Number(p.price),
    available: p.quantity > 0,
    updated_at: p.updatedAt.toISOString(),
  }));
  // cursor pra próxima página (null = acabou).
  const next = products.length === limit ? products[products.length - 1].id : null;

  if (String(req.query.format).toLowerCase() === 'csv') {
    const header = 'id,name,quantity,price,available,updated_at';
    const csv = [header, ...rows.map((r) => [r.id, r.name, r.quantity, r.price, r.available, r.updated_at].map(csvEscape).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
    return res.send(csv);
  }

  return res.json({ store_id: storeId, count: rows.length, next, products: rows });
};

/** Interpreta `{ quantity }` (absoluto) ou `{ adjust }` (delta). */
export function parseStockOp(body: any): { set: number } | { adjust: number } | { error: string } {
  const hasQty = body?.quantity !== undefined;
  const hasAdj = body?.adjust !== undefined;
  if (hasQty === hasAdj) return { error: 'Envie "quantity" (absoluto) OU "adjust" (delta) — um dos dois.' };
  if (hasQty) {
    const q = Number(body.quantity);
    if (!Number.isInteger(q) || q < 0) return { error: '"quantity" deve ser inteiro >= 0' };
    return { set: q };
  }
  const a = Number(body.adjust);
  if (!Number.isInteger(a)) return { error: '"adjust" deve ser inteiro (ex.: -2 vendeu 2)' };
  return { adjust: a };
}

/**
 * Aplica a operação de estoque de forma ATÔMICA (delta via `increment`, com clamp
 * de negativo em outra query) — evita lost-update sob concorrência. Retorna a
 * quantidade nova, ou null se o produto não pertence à loja.
 */
async function applyStockOp(storeId: string, productId: string, op: { set: number } | { adjust: number }): Promise<number | null> {
  if ('set' in op) {
    const r = await prisma.product.updateMany({ where: { id: productId, storeId }, data: { quantity: op.set } });
    if (r.count === 0) return null;
  } else {
    const r = await prisma.product.updateMany({ where: { id: productId, storeId }, data: { quantity: { increment: op.adjust } } });
    if (r.count === 0) return null;
    if (op.adjust < 0) await prisma.product.updateMany({ where: { id: productId, storeId, quantity: { lt: 0 } }, data: { quantity: 0 } });
  }
  const p = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { quantity: true } });
  return p?.quantity ?? null;
}

/** PATCH /v1/products/:id/stock — atualiza o estoque de UM produto (write). */
export const setProductStock = async (req: ApiKeyRequest, res: Response) => {
  const storeId = req.integrationStoreId;
  if (!storeId) return res.status(401).json({ error: 'Não autenticado' });
  const { id } = req.params as { id: string };

  const op = parseStockOp(req.body);
  if ('error' in op) return res.status(400).json({ error: op.error });

  const qty = await applyStockOp(storeId, String(id), op);
  if (qty === null) return res.status(404).json({ error: 'Produto não encontrado nesta loja' });
  // NÃO dispara webhook: a mudança veio do próprio integrador (evita eco/loop).
  return res.json({ id: String(id), quantity: qty, available: qty > 0 });
};

/** PATCH /v1/products/stock — atualiza VÁRIOS de uma vez (sync em lote). */
export const bulkSetProductStock = async (req: ApiKeyRequest, res: Response) => {
  const storeId = req.integrationStoreId;
  if (!storeId) return res.status(401).json({ error: 'Não autenticado' });
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : null;
  if (!updates || updates.length === 0) return res.status(400).json({ error: 'Envie "updates": [{ id, quantity } | { id, adjust }]' });
  if (updates.length > 500) return res.status(400).json({ error: 'Máximo de 500 itens por chamada' });

  const results: Array<{ id: string; ok: boolean; quantity?: number; error?: string }> = [];
  for (const u of updates) {
    const op = parseStockOp(u);
    if ('error' in op) { results.push({ id: String(u?.id), ok: false, error: op.error }); continue; }
    const qty = await applyStockOp(storeId, String(u?.id), op);
    if (qty === null) { results.push({ id: String(u?.id), ok: false, error: 'not_found' }); continue; }
    results.push({ id: String(u?.id), ok: true, quantity: qty });
  }
  return res.json({ results });
};

/* ────────────  Export 1-clique (lojista logado / JWT — sem chave)  ─────── */

/** GET /integrations/export/products.csv — baixa o estoque em CSV (pro lojista
 *  comum, direto do painel; não precisa de API key nem curl). */
export const exportProductsCsv = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true, quantity: true, price: true, updatedAt: true },
    orderBy: { name: 'asc' },
  });
  const header = 'id,name,quantity,price,available,updated_at';
  const lines = products.map((p) => [p.id, p.name, p.quantity, Number(p.price), p.quantity > 0, p.updatedAt.toISOString()].map(csvEscape).join(','));
  const csv = '﻿' + [header, ...lines].join('\n'); // BOM p/ o Excel ler acentos
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
  return res.send(csv);
};

/** GET /integrations/products — estoque da loja (JSON, lojista logado) p/ a
 *  prévia em tabela no painel. */
export const listProductsForOwner = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true, quantity: true, price: true, updatedAt: true },
    orderBy: { name: 'asc' },
  });
  return res.json({
    count: products.length,
    products: products.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, price: Number(p.price), available: p.quantity > 0, updated_at: p.updatedAt.toISOString() })),
  });
};

/** POST /integrations/import/products — atualiza o estoque em massa a partir da
 *  planilha editada (lojista logado). `updates: [{ id, quantity }]` (absoluto). */
export const importProductsStock = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : null;
  if (!updates || updates.length === 0) return res.status(400).json({ error: 'Nenhuma linha pra atualizar' });
  if (updates.length > 2000) return res.status(400).json({ error: 'Máximo de 2000 itens por envio' });

  let updated = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const u of updates) {
    const q = Number(u?.quantity);
    if (!Number.isInteger(q) || q < 0) { errors.push({ id: String(u?.id), error: 'quantidade inválida' }); continue; }
    const r = await prisma.product.updateMany({ where: { id: String(u?.id), storeId: store.id }, data: { quantity: q } });
    if (r.count === 0) errors.push({ id: String(u?.id), error: 'produto não encontrado' });
    else updated++;
  }
  return res.json({ updated, errorCount: errors.length, errors: errors.slice(0, 50) });
};

/* ────────────────────  Gestão (lojista logado / JWT)  ──────────────────── */

// ── API keys ──
export const createApiKey = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const name = String((req.body?.name || 'Integração')).slice(0, 60);
  // Least-privilege: read-only (só puxa/CSV) ou read+write (também dá baixa).
  const scopes = req.body?.readOnly ? ['read'] : ['read', 'write'];

  // Retry em caso de colisão do prefix (unique) — probabilidade ínfima, mas evita 500.
  for (let attempt = 0; attempt < 3; attempt++) {
    const gen = generateApiKey();
    try {
      await prisma.storeApiKey.create({ data: { storeId: store.id, name, prefix: gen.prefix, keyHash: gen.keyHash, scopes } });
      // A chave inteira só é retornada AQUI (não é recuperável depois).
      return res.status(201).json({ key: gen.key, prefix: gen.prefix, name, scopes });
    } catch (e: any) {
      if (e?.code === 'P2002' && attempt < 2) continue; // colisão de unique → tenta de novo
      return res.status(500).json({ error: 'Não foi possível gerar a chave' });
    }
  }
  return res.status(500).json({ error: 'Não foi possível gerar a chave' });
};

export const listApiKeys = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const keys = await prisma.storeApiKey.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ keys });
};

export const revokeApiKey = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const { id } = req.params as { id: string };
  const r = await prisma.storeApiKey.updateMany({ where: { id, storeId: store.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count === 0) return res.status(404).json({ error: 'Chave não encontrada' });
  return res.json({ ok: true });
};

// ── Webhooks ──
export const createWebhook = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const url = String(req.body?.url || '').trim();
  const check = await checkWebhookUrl(url); // anti-SSRF: https + host público (com DNS)
  if (!check.ok) return res.status(400).json({ error: check.reason || 'URL de webhook inválida' });
  const secret = generateWebhookSecret();
  const hook = await prisma.storeWebhook.create({ data: { storeId: store.id, url, secret } });
  // O secret (p/ validar a assinatura HMAC) só é retornado AQUI.
  return res.status(201).json({ id: hook.id, url: hook.url, secret });
};

export const listWebhooks = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const webhooks = await prisma.storeWebhook.findMany({
    where: { storeId: store.id },
    select: { id: true, url: true, active: true, failureCount: true, lastStatus: true, lastDeliveryAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ webhooks });
};

export const deleteWebhook = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const { id } = req.params as { id: string };
  const r = await prisma.storeWebhook.deleteMany({ where: { id, storeId: store.id } });
  if (r.count === 0) return res.status(404).json({ error: 'Webhook não encontrado' });
  return res.json({ ok: true });
};

export const testWebhook = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const { id } = req.params as { id: string };
  const hook = await prisma.storeWebhook.findFirst({ where: { id, storeId: store.id } });
  if (!hook) return res.status(404).json({ error: 'Webhook não encontrado' });
  const ok = await sendTestWebhook(hook.id);
  return res.json({ ok });
};
