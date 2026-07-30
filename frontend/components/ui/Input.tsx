import { InputHTMLAttributes, ReactNode, useId } from 'react';
import styles from './Input.module.css';

export interface InputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'placeholder' | 'type' | 'disabled'
  > {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  leftIcon?: ReactNode;
  type?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Campo de texto do DROP. Único primitivo com borda funcional (ver
 * `Input.module.css`) — replica `.srch .box` do mock canônico. `leftIcon`
 * fica em `--text-muted`; `error` tinge a borda e mostra a mensagem abaixo.
 */
export function Input({
  value,
  onChange,
  placeholder,
  leftIcon,
  type = 'text',
  error,
  disabled = false,
  className,
  id,
  ...rest
}: InputProps) {
  const errorId = useId();

  return (
    <div className={className}>
      <div
        className={[styles.field, error && styles.error, disabled && styles.disabled]
          .filter(Boolean)
          .join(' ')}
      >
        {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
        <input
          id={id}
          type={type}
          className={styles.input}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
      </div>
      {error && (
        <p id={errorId} className={styles.errorText}>
          {error}
        </p>
      )}
    </div>
  );
}
