import { CSSProperties, PointerEvent, useEffect, useRef, useState } from 'react';

/**
 * Estado compartilhado dos carrosséis (premium, avisos): índice, auto-avanço
 * (pausa no hover/toque, respeita prefers-reduced-motion) e **arrasto lateral**
 * (pointer events, com pointer capture). Devolve o `trackStyle` (com o offset do
 * arrasto) e os handlers pra pôr no viewport. `movedRef` marca se houve arrasto —
 * o slide usa pra NÃO disparar o clique/navegação quando o gesto foi um swipe.
 */
export function useCarousel(count: number, intervalMs = 4000) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [dragPx, setDragPx] = useState(0);
  const startX = useRef<number | null>(null);
  const movedRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (mq) setReduced(mq.matches);
  }, []);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  const dragging = startX.current !== null;
  const auto = count > 1 && !paused && !reduced && !dragging;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [auto, count, intervalMs]);

  const safeIndex = count > 0 ? index % count : 0;

  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX;
    movedRef.current = false;
    setPaused(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 5) movedRef.current = true;
    setDragPx(dx);
  };
  const endDrag = () => {
    if (startX.current === null) return;
    const w = viewportRef.current?.offsetWidth || 0;
    const threshold = Math.max(40, w * 0.2);
    if (count > 1) {
      if (dragPx <= -threshold) setIndex((i) => (i + 1) % count);
      else if (dragPx >= threshold) setIndex((i) => (i - 1 + count) % count);
    }
    startX.current = null;
    setDragPx(0);
    setPaused(false);
  };

  const trackStyle: CSSProperties = {
    transform: `translateX(calc(-${safeIndex * 100}% + ${dragPx}px))`,
    transition: dragging ? 'none' : undefined,
  };

  const pointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => { if (startX.current === null) setPaused(false); },
  };

  return { index: safeIndex, setIndex, viewportRef, trackStyle, pointerHandlers, movedRef };
}
