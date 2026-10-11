export interface RepeatItem { productId: string; storeId: string; storeName: string; name: string; image?: string; price: number; meta: string }

const DAY = 86_400_000;

/** "Pra você repetir": produtos de pedidos não cancelados, mais recente primeiro, com a linha de apoio do protótipo. */
export function repeatItems(orders: any[], now: Date = new Date(), max = 4): RepeatItem[] {
  const valid = (orders || [])
    .filter((o) => o && !['cancelado', 'rejeitado'].includes(o.status))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const count = new Map<string, number>();
  for (const o of valid) for (const it of o.products || []) if (it.productId) count.set(it.productId, (count.get(it.productId) || 0) + 1);
  const out: RepeatItem[] = [];
  const seen = new Set<string>();
  for (const o of valid) for (const it of o.products || []) {
    if (!it.productId || seen.has(it.productId) || out.length >= max) continue;
    seen.add(it.productId);
    const store = o.storeName || 'Loja';
    const n = count.get(it.productId) || 1;
    const days = Math.max(0, Math.floor((now.getTime() - (Date.parse(o.createdAt) || now.getTime())) / DAY));
    const meta = n > 1 ? `Comprado ${n} vezes · ${store}`
      : days === 0 ? `Último pedido hoje · ${store}`
      : `Último pedido há ${days} ${days === 1 ? 'dia' : 'dias'} · ${store}`;
    out.push({ productId: it.productId, storeId: o.storeId, storeName: store, name: it.productName || 'Produto', image: it.image, price: Number(it.price) || 0, meta });
  }
  return out;
}
