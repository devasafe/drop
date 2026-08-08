import { formatBRL } from '../../ui/PriceTag';
import { paymentMethodLabel } from '../../../lib/paymentLabel';
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
  /** Forma de pagamento (enum do backend). Quando informada, renderiza o
   *  bloco "Pagamento": rótulo humano + parcelas (Nx) + saldo da carteira
   *  usado. Opcional para manter compatibilidade com usos que não têm o dado. */
  paymentMethod?: string | null;
  installmentCount?: number | null;
  walletApplied?: number;
  /** Total REALMENTE cobrado no cartão (grosseado, com juros) e o valor da
   *  parcela — persistidos no pedido. `total` (acima) é o valor BASE do pedido;
   *  estes mostram o que o cliente pagou de fato no cartão. */
  cardChargedTotal?: number | null;
  installmentValue?: number | null;
}

/**
 * Itens do pedido (`order.products`) + resumo de valores na tela de
 * acompanhamento — reusa o padrão de `CheckoutItems`/`OrderSummary` do
 * checkout: linhas `nome × qtd = subtotal` separadas por divisor `--line`,
 * seguidas do bloco subtotal/frete/desconto/total (Regra de-cardify: sem
 * cards aninhados, fronteiras só via divisor/espaçamento).
 */
export function OrderItemsSummary({
  items, subtotal, deliveryFee, discount, total,
  paymentMethod, installmentCount, walletApplied,
  cardChargedTotal, installmentValue,
}: OrderItemsSummaryProps) {
  const installments = installmentCount && installmentCount > 1 ? installmentCount : null;
  const walletUsed = walletApplied && walletApplied > 0 ? walletApplied : 0;
  const parcela = installmentValue && installmentValue > 0 ? installmentValue : null;
  const charged = cardChargedTotal && cardChargedTotal > 0 ? cardChargedTotal : null;
  const paymentText = paymentMethodLabel(paymentMethod) + (installments ? ` · ${installments}x` : '');
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
      {paymentMethod && (
        <div className={styles.summary}>
          <div className={styles.divider} />
          <div className={styles.summaryRow}>
            <span>Forma de pagamento</span>
            <span>{paymentText}</span>
          </div>
          {installments && parcela && (
            <div className={styles.summaryRow}>
              <span>Valor da parcela</span>
              <span>{installments}× {formatBRL(parcela)}</span>
            </div>
          )}
          {charged && charged > total && (
            <div className={styles.summaryRow}>
              <span>Total no cartão (com juros)</span>
              <span>{formatBRL(charged)}</span>
            </div>
          )}
          {walletUsed > 0 && (
            <div className={styles.summaryRow}>
              <span>Saldo da carteira usado</span>
              <span>-{formatBRL(walletUsed)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
