import { useRouter } from 'next/router';
import { useCart } from '../../contexts/CartContext';
import { CheckoutItems } from './checkout/CheckoutItems';
import { formatBRL } from '../ui/PriceTag';
import { Button } from '../ui/Button';
import type { CartItem } from '../../types/checkout';
import styles from './StoreCartPanel.module.css';

/**
 * Painel de carrinho da loja (desktop, padrão iFood): sticky à direita do cardápio.
 * Reusa `CheckoutItems` (item flat do checkout) pras linhas — mesma estética do DS,
 * com stepper −/+ e remover. No mobile fica oculto (o StickyCart global cobre).
 */
export function StoreCartPanel({ storeId }: { storeId?: string }) {
  const router = useRouter();
  const { cart, updateQuantity, removeItem } = useCart();

  const items = (storeId ? cart.filter((i: any) => !i.storeId || i.storeId === storeId) : cart) as CartItem[];
  const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

  return (
    <aside className={styles.panel}>
      <h3 className={styles.title}>Seu carrinho</h3>

      {items.length === 0 ? (
        <p className={styles.empty}>Seu carrinho está vazio. Adicione itens do cardápio ao lado.</p>
      ) : (
        <>
          <CheckoutItems items={items} onChangeQty={updateQuantity} onRemove={removeItem} />

          <div className={styles.subtotalRow}>
            <span>Subtotal</span>
            <strong>{formatBRL(subtotal)}</strong>
          </div>

          <Button onClick={() => router.push('/checkout')} style={{ width: '100%' }}>
            Ir para o checkout
          </Button>
        </>
      )}
    </aside>
  );
}

export default StoreCartPanel;
