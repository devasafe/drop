import { formatBRL } from '../../ui/PriceTag';
import styles from './OrderSummary.module.css';

interface OrderSummaryProps {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  isPlan1: boolean;
  loadingFee?: boolean;
}

/**
 * Resumo do pedido no checkout — linhas de subtotal/frete/desconto e total
 * em destaque. Sem cards aninhados: divisor `--line` separa o total do
 * restante das linhas (Regra de-cardify).
 */
export function OrderSummary({ subtotal, deliveryFee, discount, total, isPlan1, loadingFee }: OrderSummaryProps) {
  return (
    <div className={styles.summary}>
      <div className={styles.row}>
        <span>Subtotal</span>
        <span>{formatBRL(subtotal)}</span>
      </div>
      <div className={styles.row}>
        <span>Taxa de entrega</span>
        <span data-testid="fee-value">{isPlan1 ? '—' : loadingFee ? '…' : formatBRL(deliveryFee)}</span>
      </div>
      {discount > 0 && (
        <div className={styles.row}>
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
  );
}
