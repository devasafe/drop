import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';
import { ApiKeyRequest } from '../middleware/storeApiKey';
import { generateApiKey, generateWebhookSecret, sendTestWebhook } from '../services/storeIntegration';

/** Resolve a loja do lojista logado. */
async function resolveStore(userId?: string) {
  if (!userId) return null;
  return prisma.store.findFirst({ where: { ownerId: userId } });
}

/* ─────────────────────────  A — PULL (API key)  ───────────────────────── */

/** GET /integrations/v1/products — estoque atual da loja (JSON ou CSV). */
export const listProductsForIntegration = async (req: ApiKeyRequest, res: Response) => {
  const storeId = req.integrationStoreId;
  if (!storeId) return res.status(401).json({ error: 'Não autenticado' });

  const products = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, name: true, quantity: true, price: true, updatedAt: true },
    orderBy: { name: 'asc' },
  });

  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    price: Number(p.price),
    available: p.quantity > 0,
    updated_at: p.updatedAt.toISOString(),
  }));

  if (String(req.query.format).toLowerCase() === 'csv') {
    const header = 'id,name,quantity,price,available,updated_at';
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows.map((r) => [r.id, r.name, r.quantity, r.price, r.available, r.updated_at].map(esc).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
    return res.send(csv);
  }

  return res.json({ store_id: storeId, count: rows.length, products: rows });
};

/* ────────────────────  Gestão (lojista logado / JWT)  ──────────────────── */

// ── API keys ──
export const createApiKey = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const name = String((req.body?.name || 'Integração')).slice(0, 60);
  const gen = generateApiKey();
  await prisma.storeApiKey.create({ data: { storeId: store.id, name, prefix: gen.prefix, keyHash: gen.keyHash } });
  // A chave inteira só é retornada AQUI (não é recuperável depois).
  return res.status(201).json({ key: gen.key, prefix: gen.prefix, name });
};

export const listApiKeys = async (req: AuthenticatedRequest, res: Response) => {
  const store = await resolveStore(req.user?.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  const keys = await prisma.storeApiKey.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
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
  if (!/^https?:\/\/.+/i.test(url)) return res.status(400).json({ error: 'URL inválida (use http(s)://...)' });
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
