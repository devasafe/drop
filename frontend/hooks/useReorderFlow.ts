import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import { useCart } from '../contexts/CartContext';
import { useToast } from '../components/ui/Toast';
import { useReorder } from './useReorder';
import { ROUTES } from '../lib/routes';
import type { ReorderConfirmSheetProps } from '../components/drop/ReorderConfirmSheet';

export interface ReorderTarget { _id: string; storeId?: string; storeName?: string }
const word = (n: number) => (n === 1 ? 'item' : 'itens');

/** "Comprar de novo" com a checagem que o useReorder não faz: nunca troca a sacola sem perguntar. */
export function useReorderFlow() {
  const router = useRouter();
  const { showToast } = useToast();
  const { cart = [] } = useCart() || ({} as any);
  const { reorder } = useReorder();
  const [pending, setPending] = useState<ReorderTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (order: ReorderTarget) => {
    setBusy(true);
    try {
      const r = await reorder(order._id);
      if (r.added === 0) { showToast('Nenhum item deste pedido está disponível agora.', 'error'); return; }
      const parts = [`${r.added} ${word(r.added)} na sacola`];
      if (r.skipped.length) parts.push(`${r.skipped.length} indisponíveis`);
      if (r.priceChanged.length) parts.push(`preço mudou em ${r.priceChanged.length}`);
      showToast(parts.join(' · '), 'success');
      router.push(ROUTES.sacola);
    } catch {
      showToast('Não conseguimos montar a sacola. Tente de novo.', 'error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [reorder, showToast, router]);

  const start = useCallback((order: ReorderTarget) => {
    if ((cart as any[]).length === 0) { void run(order); return; }
    setPending(order);
  }, [cart, run]);

  const current = cart as any[];
  const currentCount = current.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const currentStoreId = current.find((i) => i.storeId)?.storeId;
  const confirm: ReorderConfirmSheetProps = {
    open: pending !== null,
    onClose: () => setPending(null),
    onConfirm: () => { if (pending) void run(pending); },
    busy,
    currentCount,
    currentStoreName: current.find((i) => i.storeName)?.storeName,
    targetStoreName: pending?.storeName,
    sameStore: !!pending?.storeId && pending.storeId === currentStoreId,
  };
  return { start, busy, confirm };
}
