import { CartItem } from '../../../types/checkout';
import { formatBRL } from '../../ui/PriceTag';
import styles from './CheckoutItems.module.css';

interface CheckoutItemsProps {
  items: CartItem[];
}

/**
 * Lista somente-leitura dos itens do pedido no checkout — `nome × qtd`
 * à esquerda, subtotal da linha à direita. Sem cards aninhados: linhas
 * separadas por divisor `--line`, mesmo padrão de OrderSummary
 * (Regra de-cardify).
 */
export function CheckoutItems({ items }: CheckoutItemsProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.productId} className={styles.row}>
          <span className={styles.info}>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.qty}>× {item.quantity}</span>
          </span>
          <span className={styles.subtotal}>{formatBRL((item.price ?? 0) * item.quantity)}</span>
        </li>
      ))}
    </ul>
  );
}
