import { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import styles from './List.module.css';

export interface ListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

/**
 * Lista achatada do DS: linhas (`Row`) separadas por divisória (--line), sem
 * caixa. É o padrão flat para coleções — use no lugar dos `.xxxList/.xxxRow`
 * reescritos à mão. Para agrupar 1 bloco denso/interativo, use `Card`.
 */
export function List({ children, className, ...rest }: ListProps) {
  return (
    <div className={[styles.list, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export interface RowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  /** Barra de acento --brand à esquerda (ex.: item novo/destacado). */
  accent?: boolean;
  /** Liga hover/foco/teclado quando a linha inteira é clicável (com onClick). */
  interactive?: boolean;
  className?: string;
}

/**
 * Uma linha de uma `List`. Divisória superior automática entre linhas
 * (a primeira não tem). `interactive` + `onClick` habilita navegação por
 * teclado (Enter/Espaço), no mesmo espírito de `Card`.
 */
export function Row({
  children,
  accent = false,
  interactive = false,
  className,
  onClick,
  onKeyDown,
  tabIndex,
  role,
  ...rest
}: RowProps) {
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
      className={[styles.row, accent && styles.accent, interactive && styles.interactive, className]
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
