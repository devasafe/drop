import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../lib/prisma';

/**
 * Integração de estoque da loja: geração/validação de API keys e entrega de
 * webhooks (evento `stock.updated`). A key é `dk_<id12>_<secret>` — só o
 * `secret` é hasheado (SHA-256) e guardado; o `prefix` (`dk_<id12>`) é o índice
 * de lookup. A chave inteira só aparece uma vez, na criação.
 */

export interface GeneratedKey {
  key: string;    // mostrado UMA vez ao lojista
  prefix: string; // guardado em claro (lookup)
  keyHash: string;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function generateApiKey(): GeneratedKey {
  const id = crypto.randomBytes(6).toString('hex');       // 12 hex
  const secret = crypto.randomBytes(24).toString('base64url');
  const prefix = `dk_${id}`;
  const key = `${prefix}_${secret}`;
  return { key, prefix, keyHash: sha256(secret) };
}

export function parseApiKey(raw: string): { prefix: string; secret: string } | null {
  const m = /^(dk_[0-9a-f]{12})_(.+)$/.exec(String(raw || '').trim());
  return m ? { prefix: m[1], secret: m[2] } : null;
}

export function verifySecret(secret: string, keyHash: string): boolean {
  const a = Buffer.from(sha256(secret), 'hex');
  const b = Buffer.from(keyHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Segredo do webhook (usado no HMAC das entregas). */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

const MAX_FAILURES = 15; // desativa o webhook após muitas falhas seguidas

async function deliverWebhook(webhook: { id: string; url: string; secret: string; failureCount: number }, payload: unknown): Promise<boolean> {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
  try {
    const res = await axios.post(webhook.url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Drop-Event': (payload as any)?.event ?? 'event',
        'X-Drop-Signature': `sha256=${signature}`,
      },
      timeout: 6000,
      validateStatus: () => true,
    });
    const ok = res.status >= 200 && res.status < 300;
    await prisma.storeWebhook.update({
      where: { id: webhook.id },
      data: ok
        ? { lastStatus: res.status, lastDeliveryAt: new Date(), failureCount: 0 }
        : { lastStatus: res.status, lastDeliveryAt: new Date(), failureCount: { increment: 1 }, active: webhook.failureCount + 1 >= MAX_FAILURES ? false : undefined },
    });
    return ok;
  } catch {
    const failures = webhook.failureCount + 1;
    await prisma.storeWebhook.update({
      where: { id: webhook.id },
      data: { lastStatus: 0, lastDeliveryAt: new Date(), failureCount: { increment: 1 }, active: failures >= MAX_FAILURES ? false : undefined },
    }).catch(() => {});
    return false;
  }
}

/** Entrega um payload de teste a um webhook específico (endpoint de teste). */
export async function sendTestWebhook(webhookId: string): Promise<boolean> {
  const hook = await prisma.storeWebhook.findUnique({ where: { id: webhookId } });
  if (!hook) return false;
  return deliverWebhook(hook, {
    event: 'ping',
    store_id: hook.storeId,
    message: 'Webhook de teste do DROP',
    occurred_at: new Date().toISOString(),
  });
}

/**
 * Dispara `stock.updated` para os webhooks ativos da loja. Best-effort e
 * NÃO-bloqueante: chame com `void emitStockChanged(...)`. Um retry simples em 2s.
 */
export async function emitStockChanged(storeId: string, productIds: string[]): Promise<void> {
  try {
    if (!storeId || productIds.length === 0) return;
    const hooks = await prisma.storeWebhook.findMany({ where: { storeId, active: true } });
    if (hooks.length === 0) return;

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true, name: true, quantity: true, price: true },
    });
    if (products.length === 0) return;

    const payload = {
      event: 'stock.updated',
      store_id: storeId,
      products: products.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, price: Number(p.price) })),
      occurred_at: new Date().toISOString(),
    };

    for (const h of hooks) {
      const ok = await deliverWebhook(h, payload);
      if (!ok) setTimeout(() => { deliverWebhook({ ...h, failureCount: h.failureCount + 1 }, payload).catch(() => {}); }, 2000);
    }
  } catch {
    // best-effort: nunca quebra o fluxo de negócio (venda/cancelamento/ajuste)
  }
}
