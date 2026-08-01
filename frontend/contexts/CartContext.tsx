import React, { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext<any>(null);

export const CartProvider = ({ children }: any) => {
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('cart');
    if (raw) setCart(JSON.parse(raw));
  }, []);

  const save = (c: any[]) => {
    setCart(c);
    localStorage.setItem('cart', JSON.stringify(c));
  };

  const add = (item: any) => {
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

  return <CartContext.Provider value={{ cart, add, clear, updateQuantity, removeItem }}>{children}</CartContext.Provider>;
};

export const useCart = () => useContext(CartContext);

export default CartContext;
