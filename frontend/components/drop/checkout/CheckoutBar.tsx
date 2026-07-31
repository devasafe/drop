import { Button } from '../../ui/Button';
import { formatBRL } from '../../ui/PriceTag';
import styles from './CheckoutBar.module.css';

export interface CheckoutBarProps {
  total: number;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Dica exibida acima do botão — ex.: pendência que impede a confirmação. */
  hint?: string;
}

/**
 * Barra fixa do rodapé do checkout — total + CTA de confirmação. Único
 * elemento fixo da página (o TabBar global não renderiza em `/checkout`),
 * então não há coordenação de z-index com outro dock.
 */
export function CheckoutBar({ total, onConfirm, disabled, loading, hint }: CheckoutBarProps) {
  return (
    <div className={styles.bar}>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.row}>
        <span className={styles.total}>{formatBRL(total)}</span>
        <Button onClick={onConfirm} disabled={disabled} loading={loading}>
          {loading ? 'Processando…' : 'Confirmar'}
        </Button>
      </div>
    </div>
  );
}
