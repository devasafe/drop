import { AlertTriangle, Inbox } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import styles from './LoadState.module.css';

/** Leitura que falhou (spec D3a 6.1, fail closed): a mensagem e "Tentar de novo". Nunca lista vazia nem zero. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.state} role="alert">
      <EmptyState
        variant="error"
        icon={<AlertTriangle size={28} aria-hidden="true" />}
        title="Não deu para carregar"
        description={message}
        onRetry={onRetry}
      />
    </div>
  );
}

/** Carregando: esqueleto, sem texto de vazio. */
export function LoadSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.state} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={20} />)}
    </div>
  );
}

/** Vazio de verdade (a leitura deu certo e não há nada). */
export function EmptyNote({ text }: { text: string }) {
  return (
    <div className={styles.state}>
      <EmptyState icon={<Inbox size={28} aria-hidden="true" />} title={text} />
    </div>
  );
}
