import { formatMoney } from '../../lib/money';
import styles from './OrderSummary.module.css';

export interface SummaryLine {
  label: string;
  /** Crédito (cupom, saldo) vem negativo. */
  value: number;
  /** `credit` pinta de verde: é dinheiro que volta para o cliente. */
  tone?: 'credit';
  /** Texto no lugar de R$ 0,00 ("Grátis"). */
  freeLabel?: string;
}

export interface OrderSummaryProps {
  lines: SummaryLine[];
  total: number;
  totalLabel?: string;
}

/**
 * Resumo de valores da sacola/pedido (DS v2, spec §7.1). Uma linha por
 * componente do preço; o total é o maior número da tela. O botão de pagar
 * repete o total — o cliente nunca soma de cabeça.
 */
export function OrderSummary({ lines, total, totalLabel = 'Total' }: OrderSummaryProps) {
  return (
    <dl className={styles.summary}>
      {lines.map((line) => (
        <div key={line.label} className={styles.row}>
          <dt>{line.label}</dt>
          <dd className={[line.tone === 'credit' && styles.credit, line.value === 0 && line.freeLabel && styles.free].filter(Boolean).join(' ') || undefined}>
            {line.value === 0 && line.freeLabel ? line.freeLabel : formatMoney(line.value)}
          </dd>
        </div>
      ))}
      <div className={[styles.row, styles.total].join(' ')}>
        <dt>{totalLabel}</dt>
        <dd>{formatMoney(total)}</dd>
      </div>
    </dl>
  );
}
