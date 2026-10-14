import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useCart, type CartAddItem } from '../contexts/CartContext';
import { useToast } from '../components/ui/Toast';
import { ROUTES } from '../lib/routes';

/**
 * Adicionar com feedback imediato (spec §4 princípio 6): toast "Adicionado à sacola" + "Ver sacola".
 * `note` completa o toast (ex.: "O preço mudou: agora R$ 19,00.").
 */
export function useAddToCart() {
  const { add } = useCart();
  const { showToast } = useToast();
  const router = useRouter();
  return useCallback((item: CartAddItem, opts?: { note?: string }) => add(item, {
    onAdded: () => showToast(opts?.note ? `Adicionado à sacola. ${opts.note}` : 'Adicionado à sacola', 'success', { action: { label: 'Ver sacola', onClick: () => router.push(ROUTES.sacola) } }),
  }), [add, showToast, router]);
}
