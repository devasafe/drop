import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ICON_BUTTON_STROKE_WIDTH } from '../ui/Icon';
import styles from './ScreenHeader.module.css';

export interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  /** Ação à direita (ajuda, "Marcar lidas", imprimir…). */
  end?: ReactNode;
  /** Texto curto à direita do título (ex.: "#4836", "Eletro Center"). */
  meta?: ReactNode;
  as?: 'h1' | 'h2';
}

/** Topo das telas com "voltar" (protótipo `.u-top`): voltar 44×44, título que corta com reticências, ação à direita. */
export function ScreenHeader({ title, onBack, backLabel = 'Voltar', end, meta, as: H = 'h1' }: ScreenHeaderProps) {
  return (
    <header className={styles.top}>
      {onBack && (
        <button type="button" className={styles.back} aria-label={backLabel} onClick={onBack}>
          <ArrowLeft size={22} strokeWidth={ICON_BUTTON_STROKE_WIDTH} aria-hidden="true" />
        </button>
      )}
      <H className={styles.title}>{title}</H>
      {meta && <span className={styles.meta}>{meta}</span>}
      {end && <div className={styles.end}>{end}</div>}
    </header>
  );
}
