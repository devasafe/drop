import { ReactNode } from 'react';
import styles from './RadioRow.module.css';

export interface RadioRowProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: ReactNode;
  description?: ReactNode;
  /** Cor do destaque quando selecionado. */
  tone?: 'brand' | 'danger';
  disabled?: boolean;
}

/**
 * Linha de opção de rádio no DS: círculo à esquerda + título/descrição,
 * destaque de borda/fundo no selecionado. Substitui listas de rádio soltas
 * (ex.: motivos de cancelamento/rejeição) por algo legível e clicável inteiro.
 */
export function RadioRow({ name, value, checked, onChange, label, description, tone = 'brand', disabled }: RadioRowProps) {
  const activeCls = checked ? (tone === 'danger' ? styles.activeDanger : styles.active) : '';
  return (
    <label className={`${styles.row} ${activeCls} ${disabled ? styles.disabled : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className={styles.input}
      />
      <span className={styles.dot} aria-hidden="true">
        {checked && <span className={styles.dotInner} />}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.desc}>{description}</span>}
      </span>
    </label>
  );
}

export default RadioRow;
