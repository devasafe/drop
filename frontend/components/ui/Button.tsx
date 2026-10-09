import { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';
import { ICON_STROKE_WIDTH } from './Icon';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'danger'
  | 'onImage'
  /** @deprecated use `tertiary` */
  | 'ghost'
  /** @deprecated use `primary` */
  | 'accent';
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
 * Botão de ação do DROP. Variantes: `primary` (ação principal), `secondary`
 * (contorno), `tertiary` (só texto), `danger` e `onImage` (sobre foto/hero).
 * `ghost` e `accent` são aliases depreciados de `tertiary` e `primary`.
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
  const v = variant === 'ghost' ? 'tertiary' : variant === 'accent' ? 'primary' : variant;

  return (
    <button
      type={type}
      className={[styles.button, styles[v], styles[size], className]
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
