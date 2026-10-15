import { Button } from '../ui/Button';
import styles from './BatchBar.module.css';

export interface BatchBarProps {
  count: number;
  /** Ex.: "R$ 1.284,30" ou "8 lojas · 4 motoboys". */
  summary?: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  onClear: () => void;
}

/**
 * Barra fixa no rodapé quando há seleção (spec D3a 4; protótipo "12 selecionados · R$ 1.284,30").
 * Botões com toque de 44 px. Deixa um espaço no fim da página para não cobrir a última linha.
 */
export function BatchBar({ count, summary, actionLabel, onAction, busy = false, onClear }: BatchBarProps) {
  if (count <= 0) return null;
  const head = count === 1 ? '1 selecionado' : `${count} selecionados`;
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <div className={styles.bar} role="region" aria-label="Itens selecionados">
        <p className={styles.text}>{summary ? `${head} · ${summary}` : head}</p>
        <div className={styles.buttons}>
          <Button variant="secondary" className={styles.touch} onClick={onClear} disabled={busy}>Limpar</Button>
          <Button className={styles.touch} onClick={onAction} disabled={busy}>{busy ? 'Enviando…' : actionLabel}</Button>
        </div>
      </div>
    </>
  );
}

export default BatchBar;
