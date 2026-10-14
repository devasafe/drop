import { useEffect, useRef } from 'react';
import { useCart } from '../contexts/CartContext';
import { useToast } from '../components/ui/Toast';
import { fetchCurrentProduct, priceDiffers } from '../lib/currentProduct';
import { formatMoney } from '../lib/money';

/**
 * Sacola confere cada item com o servidor ao abrir (e quando entra ou sai produto): o preço, o nome
 * e a foto passam a ser os atuais, e o que foi removido, pausado ou esgotou sai com aviso. Assim o
 * total da tela é o mesmo que o servidor cobra (POST /orders usa o preço atual do banco), mesmo que
 * o item tenha entrado com um preço velho (pedido antigo, aba aberta há dias, lojista editou).
 * Erro de rede deixa o item como está: o servidor continua sendo quem decide a cobrança.
 */
export function useCartRevalidation() {
  const { cart = [], syncItems } = useCart() || ({} as any);
  const { showToast } = useToast();
  const cartRef = useRef<any[]>(cart);
  cartRef.current = cart;
  const ids = (cart as any[]).map((i) => String(i.productId)).sort().join(',');

  useEffect(() => {
    if (!ids || typeof syncItems !== 'function') return;
    let off = false;
    const items = cartRef.current;
    Promise.all(items.map(async (item) => ({ item, r: await fetchCurrentProduct(String(item.productId)) }))).then((results) => {
      if (off) return;
      const fresh: Record<string, { name: string; price: number; image: string | null } | null> = {};
      const removed: string[] = [];
      const changed: string[] = [];
      let touched = false;
      for (const { item, r } of results) {
        if (r.status === 'gone' || r.status === 'soldout') {
          fresh[item.productId] = null;
          removed.push(r.status === 'soldout' ? r.name : item.name || 'Produto');
          touched = true;
        } else if (r.status === 'ok') {
          const { name, price, image } = r.product;
          fresh[item.productId] = { name, price, image };
          if (priceDiffers(price, Number(item.price) || 0)) changed.push(`O preço de ${name} mudou: agora ${formatMoney(price)}.`);
          if (name !== item.name || priceDiffers(price, Number(item.price) || 0) || (image ?? null) !== (item.image ?? null)) touched = true;
        }
      }
      if (touched) syncItems(fresh);
      const notes = [...changed];
      if (removed.length) notes.push(`${removed.join(', ')} ${removed.length === 1 ? 'saiu' : 'saíram'} da sacola: não ${removed.length === 1 ? 'está' : 'estão'} mais disponível${removed.length === 1 ? '' : 'is'}.`);
      if (notes.length) showToast(notes.join(' '), 'info');
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
}
