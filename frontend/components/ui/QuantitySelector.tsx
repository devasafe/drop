import { Minus, Plus, Trash2 } from 'lucide-react';
import styles from './QuantitySelector.module.css';

export interface QuantitySelectorProps {
  /** Nome do item — entra no nome acessível dos botões ("Aumentar quantidade de X"). */
  itemName: string;
  value: number;
  onChange: (value: number) => void;
  /** 1 na página do produto; 0 na sacola (chegar a 0 = remover). */
  min?: number;
  /** Estoque disponível. */
  max?: number;
  disabled?: boolean;
  size?: 'md' | 'sm';
}

/**
 * Seletor de quantidade (DS v2), extraído do stepper do CheckoutItems.
 * Botões com 44px de toque. Com `min={0}`, o "−" no 1 vira lixeira
 * ("Remover X"): remover é levar a quantidade a zero, sem lixeira solta.
 */
export function QuantitySelector({
  itemName,
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  size = 'md',
}: QuantitySelectorProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const removes = min === 0 && value === 1;

  return (
    <div className={[styles.root, styles[size]].join(' ')}>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || atMin}
        aria-label={removes ? `Remover ${itemName}` : `Diminuir quantidade de ${itemName}`}
        onClick={() => onChange(value - 1)}
      >
        {removes ? <Trash2 size={16} strokeWidth={1.75} /> : <Minus size={16} strokeWidth={2} />}
      </button>
      <span className={styles.value} role="status" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || atMax}
        aria-label={`Aumentar quantidade de ${itemName}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
