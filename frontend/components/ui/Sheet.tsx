import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './Sheet.module.css';
import { ICON_STROKE_WIDTH } from './Icon';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet dark: desliza do rodapé, `--r-2xl` só no topo, backdrop
 * `--scrim-strong`. Fecha ao clicar no backdrop ou pressionar Esc. Fechado
 * (`open={false}`) não monta o conteúdo — evita efeitos/estado de filhos
 * ociosos rodando fora de tela.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.wrapper}>
      <div
        className={styles.backdrop}
        data-testid="sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
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
    </div>
  );
}
