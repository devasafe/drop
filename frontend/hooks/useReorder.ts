import { useCallback } from 'react';
import api from '../lib/api';
import { useCart } from '../contexts/CartContext';

export type ReorderReason = 'DELETED' | 'OUT_OF_STOCK' | 'STORE_UNAVAILABLE';

export interface ReorderItem {
  productId: string;
  name: string;
  image: string | null;
  price: number;
  previousPrice: number;
  quantity: number;
  requestedQuantity: number;
  available: boolean;
  priceChanged: boolean;
  reason: ReorderReason | null;
}

export interface ReorderResult {
  added: number;
  skipped: ReorderItem[];
  priceChanged: ReorderItem[];
}

/**
 * "Comprar de novo": consulta preço/estoque atuais e põe na sacola só o que está disponível.
 * Os avisos (indisponíveis, preço mudou) voltam para a UI decidir o toast.
 */
export function useReorder() {
  const { replaceCart } = useCart();

  const reorder = useCallback(async (orderId: string): Promise<ReorderResult> => {
    const res = await api.get<{ data: { storeId: string; items: ReorderItem[] } }>(`/orders/${orderId}/reorder`);
    const { storeId, items } = res.data.data;
    const available = items.filter((i) => i.available);
    const skipped = items.filter((i) => !i.available);
    if (available.length > 0) {
      replaceCart(
        storeId,
        available.map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.name, price: i.price, image: i.image })),
      );
    }
    return { added: available.length, skipped, priceChanged: available.filter((i) => i.priceChanged) };
  }, [replaceCart]);

  return { reorder };
}
