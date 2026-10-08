import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sheet } from '../components/ui/Sheet';
import { Button } from '../components/ui/Button';

const CartContext = createContext<any>(null);

/** Cada pedido é de uma loja só: o backend recusa produto de outra loja. */
function isFromOtherStore(cart: any[], item: any): boolean {
  const current = cart.find((x) => x.storeId)?.storeId;
  return Boolean(current && item.storeId && item.storeId !== current);
}

export const CartProvider = ({ children }: any) => {
  const [cart, setCart] = useState<any[]>([]);
  const [pendingSwap, setPendingSwap] = useState<any | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('cart');
    if (raw) setCart(JSON.parse(raw));
  }, []);

  const save = (c: any[]) => {
    setCart(c);
    localStorage.setItem('cart', JSON.stringify(c));
  };

  const add = (item: any) => {
    if (isFromOtherStore(cart, item)) {
      setPendingSwap(item);
      return;
    }
    const found = cart.find((x) => x.productId === item.productId);
    let next;
    if (found) {
      next = cart.map((x) => x.productId === item.productId ? { ...x, quantity: x.quantity + item.quantity } : x);
    } else {
      next = [...cart, item];
    }
    save(next);
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

  const confirmSwap = () => {
    save([pendingSwap]);
    setPendingSwap(null);
  };

  const cancelSwap = () => setPendingSwap(null);

  return (
    <CartContext.Provider value={{ cart, add, clear, updateQuantity, removeItem }}>
      {children}
      <Sheet open={pendingSwap !== null} onClose={cancelSwap} title="Trocar de loja?">
        <p>
          Sua sacola tem itens de outra loja. Cada pedido é feito em uma loja só. Para adicionar
          {pendingSwap?.name ? ` "${pendingSwap.name}"` : ' este item'}, a sacola atual será esvaziada.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <Button onClick={confirmSwap}>Esvaziar e adicionar</Button>
          <Button variant="ghost" onClick={cancelSwap}>Manter minha sacola</Button>
        </div>
      </Sheet>
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

export default CartContext;
