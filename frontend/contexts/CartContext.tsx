import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sheet } from '../components/ui/Sheet';
import { Button } from '../components/ui/Button';

const CartContext = createContext<any>(null);

export interface CartAddItem { productId: string; quantity: number; name: string; price: number; storeId?: string; storeName?: string; image?: string | null }
type AddResult = 'added' | 'swap';

/** Cada pedido é de uma loja só: o backend recusa produto de outra loja. */
function isFromOtherStore(cart: any[], item: any): boolean {
  const current = cart.find((x) => x.storeId)?.storeId;
  return Boolean(current && item.storeId && item.storeId !== current);
}

export const CartProvider = ({ children }: any) => {
  const [cart, setCart] = useState<any[]>([]);
  const [pendingSwap, setPendingSwap] = useState<{ item: CartAddItem; onAdded?: () => void } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('cart');
    if (raw) setCart(JSON.parse(raw));
  }, []);

  const persist = (c: any[]) => {
    try {
      localStorage.setItem('cart', JSON.stringify(c));
    } catch (err) {
      // Modo privado / storage cheio: a sacola em memória continua valendo.
      console.warn('[cart] não foi possível persistir a sacola:', err);
    }
  };

  const save = (c: any[]) => {
    setCart(c);
    persist(c);
  };

  const add = (item: CartAddItem, opts?: { onAdded?: () => void }): AddResult => {
    if (isFromOtherStore(cart, item)) {
      setPendingSwap({ item, onAdded: opts?.onAdded });
      return 'swap';
    }
    const found = cart.find((x) => x.productId === item.productId);
    let next;
    if (found) {
      next = cart.map((x) => x.productId === item.productId ? { ...x, quantity: x.quantity + item.quantity } : x);
    } else {
      next = [...cart, item];
    }
    save(next);
    opts?.onAdded?.();
    return 'added';
  };

  const clear = () => {
    save([]);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const q = Math.max(1, Math.floor(quantity));
    save(cart.map((x) => (x.productId === productId ? { ...x, quantity: q } : x)));
  };

  const removeItem = (productId: string) => {
    save(cart.filter((x) => x.productId !== productId));
  };

  /**
   * Substitui a sacola inteira de uma vez (um único setState, sem o estado velho do add em
   * sequência). Como troca tudo, a regra de uma loja por sacola vale por construção: todo item
   * leva o storeId recebido e o que havia de outra loja some.
   */
  const replaceCart = (storeId: string, items: Array<{ productId: string; quantity: number; name: string; price: number; [k: string]: any }>) => {
    setPendingSwap(null);
    save(items.map((i) => ({ ...i, storeId })));
  };

  /**
   * Aplica o estado ATUAL dos produtos (servidor) aos itens da sacola: preço, nome e foto passam a ser
   * os de agora; `null` tira o item (removido, pausado ou esgotado). Funcional sobre o estado mais
   * recente, para não perder uma mudança de quantidade feita enquanto a consulta estava no ar.
   */
  const syncItems = (fresh: Record<string, { name: string; price: number; image?: string | null } | null>) => {
    setCart((prev) => {
      const next = prev
        .filter((x) => fresh[x.productId] !== null)
        .map((x) => (fresh[x.productId] ? { ...x, ...fresh[x.productId] } : x));
      persist(next);
      return next;
    });
  };

  const confirmSwap = () => {
    if (!pendingSwap) return;
    save([pendingSwap.item]);
    const cb = pendingSwap.onAdded;
    setPendingSwap(null);
    cb?.();
  };

  const cancelSwap = () => setPendingSwap(null);

  const current = cart.filter((x) => x.storeId);
  const count = current.reduce((n, x) => n + (Number(x.quantity) || 0), 0);
  const currentStore = current.find((x) => x.storeName)?.storeName;
  const itemsWord = count === 1 ? 'item' : 'itens';

  return (
    <CartContext.Provider value={{ cart, add, clear, updateQuantity, removeItem, replaceCart, syncItems }}>
      {children}
      <Sheet open={pendingSwap !== null} onClose={cancelSwap} title="Trocar de loja?" presentation="center">
        <p>
          Sua sacola tem {count} {itemsWord} {currentStore ? `da ${currentStore}` : 'de outra loja'}. Cada pedido é de uma loja só.
          Para adicionar "{pendingSwap?.item.name || 'este item'}", a sacola atual será esvaziada.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <Button onClick={confirmSwap}>Esvaziar e adicionar</Button>
          <Button variant="secondary" onClick={cancelSwap}>Manter minha sacola</Button>
        </div>
      </Sheet>
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

export default CartContext;
