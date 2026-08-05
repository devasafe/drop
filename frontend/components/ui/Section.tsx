import { HTMLAttributes, ReactNode } from 'react';
import styles from './Section.module.css';

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Título da seção (vira <h2>). Omita para uma seção sem cabeçalho. */
  title?: ReactNode;
  /** Ação alinhada à direita do título (botão, chip, link). */
  action?: ReactNode;
  /** Régua fina (--line) sob o cabeçalho. Default: true. */
  divider?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Seção achatada do DS: título + régua fina (--line) + conteúdo. É o padrão
 * flat para agrupar conteúdo SEM a caixa de um `Card`. Use no lugar do
 * `<div><h2 className={styles.xTitle}>…</h2>…</div>` repetido nas telas.
 * Card continua sendo a exceção (agrupamento denso/ação real), não a regra.
 */
export function Section({
  title,
  action,
  divider = true,
  children,
  className,
  ...rest
}: SectionProps) {
  return (
    <section className={[styles.section, className].filter(Boolean).join(' ')} {...rest}>
      {(title || action) && (
        <header className={[styles.header, divider && styles.headerDivider].filter(Boolean).join(' ')}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action && <div className={styles.action}>{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
