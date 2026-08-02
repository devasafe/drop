import { CSSProperties, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

interface Opts {
  size?: number;
  margin?: number;
  /** Zona segura no topo (evita a nav) e no rodapé (evita a TabBar). */
  safeTop?: number;
  safeBottom?: number;
  storageKey?: string;
  /** Chamado no toque (pointerup sem arrasto) — usar p/ "abrir". Não depende do
   * evento `click`, que o pointer capture suprime no touch. */
  onTap?: () => void;
}
interface Pos { left: number; top: number }

/**
 * Botão de ação flutuante (FAB) arrastável: arrasta pela viewport, **gruda na
 * borda** esquerda/direita ao soltar, fica dentro das zonas seguras (não cobre
 * a nav de cima nem a TabBar de baixo) e **persiste** a posição. `movedRef`
 * marca se houve arrasto — o consumidor usa pra não disparar o clique (abrir)
 * quando o gesto foi um arrasto.
 */
export function useDraggableFab(opts: Opts = {}) {
  const { size = 56, margin = 16, safeTop = 76, safeBottom = 96, storageKey = 'fabPos', onTap } = opts;
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; captured: boolean } | null>(null);
  const movedRef = useRef(false);
  const onTapRef = useRef(onTap);
  useEffect(() => { onTapRef.current = onTap; }, [onTap]);
  const THRESHOLD = 8;

  const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 400);
  const vh = () => (typeof window !== 'undefined' ? window.innerHeight : 800);
  const clampTop = useCallback((top: number) => Math.max(safeTop, Math.min(top, vh() - size - safeBottom)), [safeTop, safeBottom, size]);
  const clampLeft = useCallback((left: number) => Math.max(margin, Math.min(left, vw() - size - margin)), [margin, size]);
  const defaultPos = useCallback((): Pos => ({ left: vw() - size - margin, top: vh() - size - safeBottom }), [size, margin, safeBottom]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) { const p = JSON.parse(s); setPos({ left: clampLeft(p.left), top: clampTop(p.top) }); return; }
    } catch { /* ignore */ }
    setPos(defaultPos());
  }, [storageKey, defaultPos, clampTop, clampLeft]);

  const onPointerDown = (e: PointerEvent) => {
    const cur = pos || defaultPos();
    // NÃO capturar o ponteiro aqui: capturar no toque suprime o comportamento
    // normal e a captura só é necessária quando vira arrasto (feito no move).
    drag.current = { sx: e.clientX, sy: e.clientY, ox: cur.left, oy: cur.top, captured: false };
    movedRef.current = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.captured) {
      if (Math.abs(dx) <= THRESHOLD && Math.abs(dy) <= THRESHOLD) return; // ainda é toque
      d.captured = true;
      movedRef.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    }
    setPos({ left: clampLeft(d.ox + dx), top: clampTop(d.oy + dy) });
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!d.captured) { onTapRef.current?.(); return; } // toque → abre, sem mexer na posição
    setPos((p) => {
      if (!p) return p;
      const snappedLeft = p.left + size / 2 < vw() / 2 ? margin : vw() - size - margin;
      const next = { left: snappedLeft, top: p.top };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const style: CSSProperties = {
    position: 'fixed',
    zIndex: 50,
    touchAction: 'none',
    ...(pos ? { left: pos.left, top: pos.top } : { right: margin, bottom: safeBottom }),
  };
  const pointerHandlers = { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };

  return { style, pointerHandlers, movedRef };
}
