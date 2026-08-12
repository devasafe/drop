import { ReactNode, useEffect, useRef, useState, PointerEvent as ReactPointerEvent } from 'react';
import styles from './MapSheet.module.css';

const PEEK = 116; // px visíveis quando recolhido (alça + linha do ETA)

/**
 * Bottom-sheet arrastável (mobile). Dois estados — recolhido (mostra só o topo,
 * ~PEEK px) e expandido (conteúdo inteiro). Arrasta-se pela alça; ao soltar,
 * "gruda" no estado mais próximo. Sem libs — pointer events + translateY.
 */
export function MapSheet({ children }: { children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [sheetH, setSheetH] = useState(0);
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const startY = useRef(0);
  const startTranslate = useRef(0);

  useEffect(() => {
    const measure = () => setSheetH(sheetRef.current?.offsetHeight || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const maxHidden = Math.max(0, sheetH - PEEK);
  const baseTranslate = collapsed ? maxHidden : 0;
  const translate = dragTranslate != null ? dragTranslate : baseTranslate;

  const onDown = (e: ReactPointerEvent) => {
    startY.current = e.clientY;
    startTranslate.current = baseTranslate;
    setDragTranslate(baseTranslate);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (dragTranslate == null) return;
    const delta = e.clientY - startY.current;
    setDragTranslate(Math.min(maxHidden, Math.max(0, startTranslate.current + delta)));
  };
  const onUp = () => {
    if (dragTranslate == null) return;
    setCollapsed(dragTranslate > maxHidden / 2);
    setDragTranslate(null);
  };

  return (
    <div
      ref={sheetRef}
      className={styles.sheet}
      style={{
        transform: `translateY(${translate}px)`,
        transition: dragTranslate != null ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div
        className={styles.handleArea}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => dragTranslate == null && setCollapsed((c) => !c)}
      >
        <div className={styles.handle} />
      </div>
      {children}
    </div>
  );
}

export default MapSheet;
