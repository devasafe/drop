import { formatMoney } from '../../lib/money';
import type { InstallmentOption } from '../../lib/cardInstallments';
import styles from './PriceDisplay.module.css';

export type PriceDisplaySize = 'line' | 'card' | 'product';

export interface PriceDisplayProps {
  price: number;
  /** Preço "de". Só aparece se for maior que o atual. */
  oldPrice?: number | null;
  size?: PriceDisplaySize;
  /** Maior parcelamento disponível (vem de `installmentOptions`). Só no `product`. */
  installment?: InstallmentOption | null;
}

/**
 * Hierarquia de preço (DS v2, spec §7.1):
 * - preço atual é o maior número do bloco, na cor de preço — nunca roxo;
 * - o "de" vem riscado e apagado, com o % OFF calculado (roxo: desconto);
 * - no produto, o parcelamento diz o total por extenso, porque o cliente
 *   paga o custo do cartão (gross-up em `utils/cardInstallments.ts`).
 */
export function PriceDisplay({ price, oldPrice, size = 'card', installment }: PriceDisplayProps) {
  const hasDiscount = typeof oldPrice === 'number' && oldPrice > price;
  const pct = hasDiscount ? Math.round((1 - price / (oldPrice as number)) * 100) : 0;
  const a11y = hasDiscount
    ? `De ${formatMoney(oldPrice as number)} por ${formatMoney(price)}, ${pct}% de desconto`
    : formatMoney(price);

  return (
    <div className={[styles.root, styles[size]].join(' ')}>
      <div className={styles.row} role="group" aria-label={a11y}>
        <span className={styles.current} aria-hidden="true">{formatMoney(price)}</span>
        {hasDiscount && (
          <>
            <s className={styles.old} aria-hidden="true">{formatMoney(oldPrice as number)}</s>
            <span className={styles.off} aria-hidden="true">-{pct}%</span>
          </>
        )}
      </div>
      {size === 'product' && installment && installment.count > 1 && (
        <p className={styles.installment}>
          ou até {installment.count}x de {formatMoney(installment.installmentValue)} no cartão (total {formatMoney(installment.total)})
        </p>
      )}
    </div>
  );
}
