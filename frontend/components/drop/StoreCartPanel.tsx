import { useRouter } from 'next/router';
import { useCart } from '../../contexts/CartContext';
import { formatBRL } from '../ui/PriceTag';
import { Button } from '../ui/Button';
import styles from './StoreCartPanel.module.css';

/**
 * Painel de carrinho da loja (desktop, padrão iFood): fica sticky à direita do
 * cardápio. Lista os itens (da loja atual), subtotal e leva ao checkout. No
 * mobile é oculto via CSS — o StickyCart global já cobre esse caso.
 */
export function StoreCartPanel({ storeId }: { storeId?: string }) {
  const router = useRouter();
  const { cart, updateQuantity, removeItem } = useCart();

  const items = (storeId ? cart.filter((i: any) => !i.storeId || i.storeId === storeId) : cart) as any[];
  const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

  return (
    <aside className={styles.panel}>
      <h3 className={styles.title}>Seu carrinho</h3>

      {items.length === 0 ? (
        <p className={styles.empty}>Seu carrinho está vazio. Adicione itens do cardápio ao lado.</p>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((it) => (
              <li key={it.productId} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{it.name || 'Produto'}</span>
                  <span className={styles.itemPrice}>
                    {formatBRL((Number(it.price) || 0) * (Number(it.quantity) || 0))}
                  </span>
                </div>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    onClick={() => (it.quantity <= 1 ? removeItem(it.productId) : updateQuantity(it.productId, it.quantity - 1))}
                    aria-label="Diminuir"
                  >
                    −
                  </button>
                  <span>{it.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(it.productId, it.quantity + 1)} aria-label="Aumentar">
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>

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
