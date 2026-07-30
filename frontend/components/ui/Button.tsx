import { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';
import { ICON_STROKE_WIDTH } from './Icon';

export type ButtonVariant = 'primary' | 'ghost' | 'onImage';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Botão de ação do DROP. Variantes: `primary` (ação principal, roxo),
 * `ghost` (secundária, sem fundo/borda) e `onImage` (sobre foto/hero,
 * fundo branco + texto roxo). Raio de botão é sempre `--r-sm`.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  loading = false,
  disabled = false,
  children,
  onClick,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={onClick}
      {...rest}
    >
      {loading ? (
        <Loader2
          className={styles.spinner}
          size={16}
          strokeWidth={ICON_STROKE_WIDTH}
          aria-hidden="true"
        />
      ) : (
        leftIcon && <span className={styles.icon}>{leftIcon}</span>
      )}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
