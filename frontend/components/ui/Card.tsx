import { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  /** Torna o card inteiro clicável (ex.: linha de endereço, pedido). */
  interactive?: boolean;
  className?: string;
}

/**
 * Contêiner de agrupamento com superfície própria (`--surface` + `--line` +
 * `--r-lg`). Borda aqui é funcional — delimita um agrupamento real — não
 * decorativa. Use `Card` só quando existir conteúdo agrupado ou interação
 * real (spec: nunca por estética). `interactive` liga estados de
 * hover/active/foco e, se `onClick` for passado, também navegação por
 * teclado (Enter/Espaço).
 */
export function Card({
  children,
  interactive = false,
  className,
  onClick,
  onKeyDown,
  tabIndex,
  role,
  ...rest
}: CardProps) {
  const isClickable = interactive && !!onClick;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.(e as unknown as MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <div
      className={[styles.card, interactive && styles.interactive, className]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      onKeyDown={isClickable ? handleKeyDown : onKeyDown}
      role={isClickable ? role ?? 'button' : role}
      tabIndex={isClickable ? tabIndex ?? 0 : tabIndex}
      {...rest}
    >
      {children}
    </div>
  );
}
