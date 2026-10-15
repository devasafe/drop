import { KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Sheet.module.css';
import { ICON_STROKE_WIDTH } from './Icon';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * `center` (padrão, visual atual): dialog centralizado. `bottom` (opt-in): sobe do rodapé, cantos arredondados só no topo.
   * `side` (admin, D3a): sobe do rodapé no celular e vira painel lateral à direita a partir de 1024 px.
   */
  presentation?: 'bottom' | 'center' | 'side';
}

/** Pilha dos sheets abertos: Esc só fecha o do topo (o último a abrir). */
const openStack: string[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Sheet modal em portal no `document.body`, acima da TabBar. Fecha ao clicar
 * no backdrop ou pressionar Esc (com vários abertos, Esc fecha só o do topo).
 * Tab e Shift+Tab ficam presos dentro do dialog. O foco vai para o dialog ao
 * abrir e volta para quem o abriu ao fechar, mesmo se um filho usar `autoFocus`.
 * Fechado (`open={false}`) não monta o conteúdo.
 * No SSR não renderiza nada (o portal só existe depois de montado no cliente).
 */
export function Sheet({ open, onClose, title, children, presentation = 'center' }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const stackId = useId();
  const visible = open && mounted;

  // onClose fica numa ref: callbacks inline mudam de identidade a cada render e
  // não podem re-empilhar o sheet (isso embaralharia a ordem do Esc).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Quem abriu: capturado NO RENDER da transição fechado→aberto, antes do commit.
  // Um filho com autoFocus recebe o foco durante o commit; ler activeElement num
  // efeito já devolveria o campo (bug estacionado na fase B).
  const openerRef = useRef<HTMLElement | null>(null);
  const wasVisible = useRef(false);
  if (visible && !wasVisible.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasVisible.current = visible;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!visible) return;
    openStack.push(stackId);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === stackId) onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const i = openStack.lastIndexOf(stackId);
      if (i >= 0) openStack.splice(i, 1);
    };
  }, [visible, stackId]);

  useEffect(() => {
    if (!visible) return;
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [visible]);

  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

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
        onKeyDown={trapTab}
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
