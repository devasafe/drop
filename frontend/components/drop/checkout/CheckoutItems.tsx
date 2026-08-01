import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem } from '../../../types/checkout';
import { formatBRL } from '../../ui/PriceTag';
import styles from './CheckoutItems.module.css';

interface CheckoutItemsProps {
  items: CartItem[];
  onChangeQty?: (productId: string, quantity: number) => void;
  onRemove?: (productId: string) => void;
}

/**
 * Lista de itens do carrinho no checkout. Só-leitura por padrão (`nome × qtd`,
 * subtotal à direita, padrão de-cardify). Se receber `onChangeQty`/`onRemove`,
 * cada linha ganha um stepper (− qtd +) e um botão de remover (lixeira).
 */
export function CheckoutItems({ items, onChangeQty, onRemove }: CheckoutItemsProps) {
  const editable = !!(onChangeQty || onRemove);
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.productId} className={styles.row}>
          <span className={styles.info}>
            <span className={styles.name}>{item.name}</span>
            {!editable && <span className={styles.qty}>× {item.quantity}</span>}
            {editable && (
              <span className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  aria-label="Diminuir quantidade"
                  disabled={item.quantity <= 1}
                  onClick={() => onChangeQty?.(item.productId, item.quantity - 1)}
                >
                  <Minus size={14} strokeWidth={2.4} aria-hidden="true" />
                </button>
                <span className={styles.stepQty}>{item.quantity}</span>
                <button
                  type="button"
                  className={styles.stepBtn}
                  aria-label="Aumentar quantidade"
                  onClick={() => onChangeQty?.(item.productId, item.quantity + 1)}
                >
                  <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </span>
            )}
          </span>
          <span className={styles.end}>
            <span className={styles.subtotal}>{formatBRL((item.price ?? 0) * item.quantity)}</span>
            {editable && onRemove && (
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={`Remover ${item.name ?? 'item'}`}
                onClick={() => onRemove(item.productId)}
              >
                <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
