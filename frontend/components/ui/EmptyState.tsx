import { ReactNode } from 'react';
import { Button } from './Button';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Normalmente um `Button` com a ação que resolve o estado vazio. */
  action?: ReactNode;
  variant?: 'default' | 'error';
  /** Com `variant="error"`, mostra "Tentar de novo" e chama isto. */
  onRetry?: () => void;
}

/**
 * Estado vazio: ícone + título + descrição opcional + ação opcional. Convite
 * a agir — a descrição explica o porquê, a ação resolve, nunca só "nada
 * aqui".
 */
export function EmptyState({ icon, title, description, action, variant = 'default', onRetry }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {variant === 'error' && onRetry && (
        <div className={styles.action}>
          <Button variant="secondary" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
