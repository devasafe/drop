import { AlertTriangle, Wallet } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { formatBRL } from '../../ui/PriceTag';
import styles from './WalletToggle.module.css';

export interface WalletToggleProps {
  balance: number;
  /** Só `true` quando o método de pagamento ativo é PIX — controlado pelo pai. */
  enabled: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Dívida pendente do saldo (ex.: uso anterior a crédito). > 0 exibe aviso destacado. */
  pendingDebt?: number;
}

/**
 * Alterna o uso do saldo da carteira como forma de pagamento no checkout.
 * Só fica habilitável com PIX (`enabled`, controlado pelo pai); nos demais
 * métodos aparece desabilitado — saldo de carteira não compõe pagamento
 * fora do PIX. `pendingDebt` > 0 destaca que parte do saldo está
 * comprometida com uma dívida anterior.
 */
export function WalletToggle({ balance, enabled, checked, onChange, pendingDebt }: WalletToggleProps) {
  const hasPendingDebt = (pendingDebt ?? 0) > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <div className={styles.label}>
          <Wallet size={18} strokeWidth={ICON_STROKE_WIDTH} />
          <span>
            Usar saldo da carteira
            <span className={styles.balance}>{formatBRL(balance)}</span>
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Usar saldo da carteira"
          disabled={!enabled}
          className={[styles.switch, checked && styles.on].filter(Boolean).join(' ')}
          onClick={() => enabled && onChange(!checked)}
        >
          <span className={styles.thumb} />
        </button>
      </div>
      {hasPendingDebt && (
        <div className={styles.warning}>
          <AlertTriangle size={14} strokeWidth={ICON_STROKE_WIDTH} />
          <span>Dívida pendente de {formatBRL(pendingDebt!)} será descontada do saldo.</span>
        </div>
      )}
    </div>
  );
}
