import type { ReactNode } from 'react';
import { Alert } from '../../ui/Alert';
import { Skeleton } from '../../ui/Skeleton';
import type { BlockData } from './useBlockData';
import styles from './Numeros.module.css';

/** Carregando = esqueleto; erro = aviso com "Tentar de novo" (nunca zero); com dado = o conteúdo. */
export function BlockState<T>({ state, rows = 3, children }: { state: BlockData<T>; rows?: number; children: (data: T) => ReactNode }) {
  if (state.error) {
    return (
      <Alert tone="error" title="Não deu para carregar" action={{ label: 'Tentar de novo', onClick: state.retry }}>
        {state.error}
      </Alert>
    );
  }
  if (state.loading || state.data === null) {
    return (
      <div className={styles.loading} aria-busy="true">
        <span className={styles.srOnly}>Carregando…</span>
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={20} />)}
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export default BlockState;
