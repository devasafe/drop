import { useId } from 'react';
import styles from './Switch.module.css';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}

/**
 * Liga/desliga com efeito imediato (DS v2): usar saldo da carteira,
 * notificações. Se a escolha só vale ao salvar um formulário, use Checkbox.
 * Mínimo de 44px de toque.
 */
export function Switch({ label, checked, onChange, description, disabled = false }: SwitchProps) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className={[styles.row, disabled && styles.disabled].filter(Boolean).join(' ')}>
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>{label}</span>
        {description && <span id={descId} className={styles.description}>{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        className={[styles.track, checked && styles.on].filter(Boolean).join(' ')}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} aria-hidden="true" />
      </button>
    </div>
  );
}
