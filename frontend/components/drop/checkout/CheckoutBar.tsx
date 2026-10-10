import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import styles from './CheckoutBar.module.css';

export interface CheckoutBarProps {
  total: number;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Dica exibida acima do botão — ex.: pendência que impede a confirmação. */
  hint?: string;
  /** Texto do botão (padrão "Confirmar"). */
  label?: string;
  /** Padrão true; a Sacola passa false porque o botão já diz o valor. */
  showTotal?: boolean;
  /** Legenda sob o botão ("Ao pagar, você concorda com os termos"). */
  note?: string;
  /** Sem position:fixed — a barra acompanha o fluxo da página (desktop da Sacola). */
  inline?: boolean;
}

/**
 * Barra de confirmação do rodapé — total opcional + CTA. Fixa na viewport por
 * padrão; quem a usa no mobile a monta por portal ao body (o PageTransition
 * quebra position:fixed).
 */
export function CheckoutBar({ total, onConfirm, disabled, loading, hint, label = 'Confirmar', showTotal = true, note, inline }: CheckoutBarProps) {
  return (
    <div className={[styles.bar, inline && styles.inline].filter(Boolean).join(' ')}>
      {hint && <p className={styles.hint} role="status">{hint}</p>}
      <div className={styles.row}>
        {showTotal && <span className={styles.total}>{formatMoney(total)}</span>}
        <div className={styles.cta}>
          <Button onClick={onConfirm} disabled={disabled} loading={loading}>
            {loading ? 'Processando…' : label}
          </Button>
        </div>
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
