import { useRouter } from 'next/router';
import { useCart } from '../../contexts/CartContext';
import { CartItem } from './CartItem';
import { Button } from '../ui/Button';
import { formatMoney } from '../../lib/money';
import { imageUrl } from '../../lib/config';
import { ROUTES } from '../../lib/routes';
import styles from './StoreCartPanel.module.css';

/**
 * Sacola da loja (desktop): sticky à direita do cardápio, com as linhas do CartItem
 * (levar a quantidade a 0 remove). No mobile fica oculta: a barra da sacola global cobre.
 */
export function StoreCartPanel({ storeId }: { storeId?: string }) {
  const router = useRouter();
  const { cart = [], updateQuantity, removeItem } = useCart();
  const items = (storeId ? cart.filter((i: any) => !i.storeId || i.storeId === storeId) : cart) as any[];
  const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

  return (
    <aside className={styles.panel} aria-label="Sua sacola">
      <h2 className={styles.title}>Sua sacola</h2>
      {items.length === 0 ? (
        <p className={styles.empty}>Sua sacola está vazia. Toque em + num produto.</p>
      ) : (
        <>
          {items.map((i) => (
            <CartItem
              key={i.productId}
              item={{ name: i.name, price: Number(i.price) || 0, quantity: i.quantity, imageUrl: imageUrl(i.image) || null }}
              onQuantityChange={(q) => (q <= 0 ? removeItem(i.productId) : updateQuantity(i.productId, q))}
            />
          ))}
          <div className={styles.subtotalRow}>
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <Button onClick={() => router.push(ROUTES.sacola)}>Ver sacola</Button>
        </>
      )}
    </aside>
  );
}

export default StoreCartPanel;
