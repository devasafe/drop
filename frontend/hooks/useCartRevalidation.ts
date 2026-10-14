import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useCart } from '../contexts/CartContext';
import { priceDiffers } from '../lib/currentProduct';
import { formatMoney } from '../lib/money';

export type CartCheckStatus = 'checking' | 'ok' | 'failed';
export interface CartRevalidation {
  /** `ok` só depois que o servidor confirmou os itens. Sem `ok`, a Sacola não deixa pagar. */
  status: CartCheckStatus;
  /** Aviso fixo do que mudou na última conferência (preço novo, item que saiu). */
  notice: string | null;
  retry: () => void;
}

/** Teto de ids por GET /products?ids= (contrato do backend). */
const IDS_PER_REQUEST = 50;
/** Conferência recente e sacola igual: não pergunta de novo (abrir/fechar a Sacola, ir ao produto e voltar). */
const FRESH_MS = 30_000;

// Estado de módulo: compartilhado entre as telas montadas (dedupe) e entre aberturas da Sacola.
const inflight = new Map<string, Promise<any[]>>();
let lastCheck: { sig: string; at: number } | null = null;

/** Só para testes. */
export function __resetCartRevalidation() { inflight.clear(); lastCheck = null; }

/** Identidade do que a conferência garante: quais produtos e com que preço. Quantidade não entra. */
const signature = (items: any[]) => items
  .map((i) => `${i.productId}:${Math.round((Number(i.price) || 0) * 100)}`)
  .sort()
  .join(',');

function fetchProducts(ids: string[]): Promise<any[]> {
  const key = ids.join(',');
  const pending = inflight.get(key);
  if (pending) return pending;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) chunks.push(ids.slice(i, i + IDS_PER_REQUEST));
  const p = Promise.all(chunks.map((c) => api.get(`/products?ids=${c.map(encodeURIComponent).join(',')}`)))
    .then((rs) => {
      const list = rs.flatMap((r: any) => {
        const l = r?.data?.products;
        if (!Array.isArray(l)) throw new Error('resposta sem products');
        return l;
      });
      // Servidor que ignora `ids` (versão antiga) devolve a vitrine: não dá para concluir que um item
      // saiu do catálogo. Vira falha (fail closed) em vez de esvaziar a sacola.
      const asked = new Set(ids);
      if (list.some((p: any) => !asked.has(String(p?._id ?? p?.id)))) throw new Error('servidor ignorou ids');
      return list;
    })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/**
 * Sacola confere os itens com o servidor (1 GET em lote): preço, nome e foto passam a ser os atuais,
 * e o que foi removido, ficou oculto ou esgotou sai com aviso. Fail closed: enquanto não volta, ou se
 * falhar (rede, 429, 5xx), o status não é `ok` e a Sacola bloqueia o pagamento.
 */
export function useCartRevalidation(): CartRevalidation {
  const { cart = [], syncItems } = useCart() || ({} as any);
  const items = cart as any[];
  const sig = signature(items);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [result, setResult] = useState<{ sig: string; status: 'ok' | 'failed' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const isFresh = (s: string) => !!lastCheck && lastCheck.sig === s && Date.now() - lastCheck.at < FRESH_MS;
  const status: CartCheckStatus = !sig ? 'ok'
    : result?.sig === sig ? result.status
    : isFresh(sig) ? 'ok'
    : 'checking';

  useEffect(() => {
    if (!sig) return;
    if (isFresh(sig)) { setResult({ sig, status: 'ok' }); return; }
    let off = false;
    const current = itemsRef.current;
    const ids = [...new Set(current.map((i) => String(i.productId)))].sort();
    fetchProducts(ids).then((products) => {
      if (off) return;
      const byId = new Map(products.map((p: any) => [String(p._id ?? p.id), p]));
      const fresh: Record<string, { name: string; price: number; image: string | null } | null> = {};
      const removed: string[] = [];
      const changed: string[] = [];
      let touched = false;
      for (const item of current) {
        const p = byId.get(String(item.productId));
        const price = Number(p?.price);
        if (!p || p.isActive === false || !(Number(p.quantity) > 0) || !Number.isFinite(price)) {
          fresh[item.productId] = null;
          removed.push(p?.name || item.name || 'Produto');
          touched = true;
          continue;
        }
        const name = p.name || item.name || 'Produto';
        const image = p.image ?? p.images?.[0] ?? null;
        fresh[item.productId] = { name, price, image };
        if (priceDiffers(price, Number(item.price) || 0)) changed.push(`O preço de ${name} mudou: agora ${formatMoney(price)}.`);
        if (name !== item.name || priceDiffers(price, Number(item.price) || 0) || image !== (item.image ?? null)) touched = true;
      }
      const after = current.filter((i) => fresh[i.productId] !== null).map((i) => ({ ...i, ...fresh[i.productId] }));
      const afterSig = signature(after);
      lastCheck = { sig: afterSig, at: Date.now() };
      if (touched && typeof syncItems === 'function') syncItems(fresh);
      const notes = [...changed];
      if (removed.length === 1) notes.push(`${removed[0]} saiu da sacola: não está mais disponível.`);
      else if (removed.length > 1) notes.push(`${removed.join(', ')} saíram da sacola: não estão mais disponíveis.`);
      if (notes.length) setNotice(notes.join(' '));
      setResult({ sig: afterSig, status: 'ok' });
    }).catch(() => {
      if (!off) setResult({ sig, status: 'failed' });
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, attempt]);

  const retry = useCallback(() => {
    lastCheck = null;
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  return { status, notice, retry };
}
