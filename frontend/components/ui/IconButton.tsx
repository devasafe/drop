import { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'brand' | 'soft' | 'onImage' | 'brandSquare';

export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onClick' | 'aria-label' | 'children'
  > {
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: number;
  /** Obrigatório: IconButton não tem texto visível, precisa de nome acessível. */
  'aria-label': string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/** Diâmetro padrão por variante, herdado do mock canônico (`.of .add` / `.rep .add` / `.srch .f`). */
const DEFAULT_SIZE: Record<IconButtonVariant, number> = {
  brand: 34,
  soft: 30,
  onImage: 34,
  brandSquare: 42,
};

/**
 * Botão redondo/soft só de ícone (ex.: adicionar item, filtro, favoritar
 * sobre foto). Passe o ícone já dimensionado — ver `components/ui/Icon.tsx`
 * para o traço padrão (2.6 dentro de IconButton).
 */
export function IconButton({
  icon,
  variant = 'brand',
  size,
  onClick,
  className,
  disabled,
  type = 'button',
  style,
  ...rest
}: IconButtonProps) {
  const resolvedSize = size ?? DEFAULT_SIZE[variant];

  return (
    <button
      type={type}
      className={[styles.iconButton, styles[variant], className].filter(Boolean).join(' ')}
      style={{ width: resolvedSize, height: resolvedSize, ...style }}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon}
    </button>
  );
}
