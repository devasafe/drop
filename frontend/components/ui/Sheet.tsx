import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Sheet.module.css';
import { ICON_STROKE_WIDTH } from './Icon';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** `center` (padrão, visual atual): dialog centralizado. `bottom` (opt-in): sobe do rodapé, cantos arredondados só no topo. */
  presentation?: 'bottom' | 'center';
}

/**
 * Sheet modal em portal no `document.body`, acima da TabBar. Fecha ao clicar
 * no backdrop ou pressionar Esc. O foco vai para o dialog ao abrir e volta
 * para quem o abriu ao fechar. Fechado (`open={false}`) não monta o conteúdo.
 * No SSR não renderiza nada (o portal só existe depois de montado no cliente).
 */
export function Sheet({ open, onClose, title, children, presentation = 'center' }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const visible = open && mounted;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <div className={`${styles.wrapper} ${styles[presentation]}`}>
      <div
        className={styles.backdrop}
        data-testid="sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`${styles.sheet} ${styles[presentation]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={styles.content}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
