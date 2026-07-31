import { formatBRL } from '../../ui/PriceTag';
import styles from './OrderItemsSummary.module.css';

export interface OrderItemsSummaryItem {
  name: string;
  quantity: number;
  price?: number;
}

interface OrderItemsSummaryProps {
  items: OrderItemsSummaryItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

/**
 * Itens do pedido (`order.products`) + resumo de valores na tela de
 * acompanhamento — reusa o padrão de `CheckoutItems`/`OrderSummary` do
 * checkout: linhas `nome × qtd = subtotal` separadas por divisor `--line`,
 * seguidas do bloco subtotal/frete/desconto/total (Regra de-cardify: sem
 * cards aninhados, fronteiras só via divisor/espaçamento).
 */
export function OrderItemsSummary({ items, subtotal, deliveryFee, discount, total }: OrderItemsSummaryProps) {
  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li key={index} className={styles.row}>
            <span className={styles.info}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.qty}>× {item.quantity}</span>
            </span>
            <span className={styles.itemSubtotal}>{formatBRL((item.price ?? 0) * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>Subtotal</span>
          <span>{formatBRL(subtotal)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Taxa de entrega</span>
          <span>{deliveryFee === 0 ? '—' : formatBRL(deliveryFee)}</span>
        </div>
        {discount > 0 && (
          <div className={styles.summaryRow}>
            <span>Desconto</span>
            <span>-{formatBRL(discount)}</span>
          </div>
        )}
        <div className={styles.divider} />
        <div className={styles.total}>
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>
      </div>
    </div>
  );
}
