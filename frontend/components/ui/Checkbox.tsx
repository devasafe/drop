import { useId } from 'react';
import { Check } from 'lucide-react';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  name?: string;
}

/**
 * Caixa de seleção (DS v2). Para escolhas independentes: termos, filtros
 * múltiplos. A linha inteira é clicável e tem no mínimo 44px de altura.
 * Por baixo é um `<input type="checkbox">` nativo — teclado e leitor de tela
 * funcionam sem ARIA extra.
 */
export function Checkbox({ label, checked, onChange, description, disabled = false, name }: CheckboxProps) {
  const descId = useId();
  return (
    <label className={[styles.row, disabled && styles.disabled].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        name={name}
        aria-describedby={description ? descId : undefined}
        onChange={(e) => { if (!disabled) onChange(e.target.checked); }}
      />
      <span className={styles.box} aria-hidden="true">
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description && <span id={descId} className={styles.description}>{description}</span>}
      </span>
    </label>
  );
}
