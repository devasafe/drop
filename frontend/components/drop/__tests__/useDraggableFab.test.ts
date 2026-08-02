import { renderHook, act } from '@testing-library/react';
import { useDraggableFab } from '../useDraggableFab';

// jsdom: innerWidth=1024, innerHeight=768. PointerEvent não é despachado p/ o
// React, então exercitamos os handlers direto (como no useCarousel).
const ev = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: { setPointerCapture() {} } } as any);

describe('useDraggableFab', () => {
  it('inicia no canto inferior direito (dentro da zona segura)', () => {
    const { result } = renderHook(() => useDraggableFab({ storageKey: 'fab-a' }));
    expect(result.current.style.left).toBe(1024 - 56 - 16); // 952
    expect(result.current.style.top).toBe(768 - 56 - 96); // 616
  });

  it('arrastar pra esquerda gruda na borda esquerda', () => {
    const { result } = renderHook(() => useDraggableFab({ storageKey: 'fab-b' }));
    const h = () => result.current.pointerHandlers as any;
    act(() => h().onPointerDown(ev(952, 616)));
    act(() => h().onPointerMove(ev(100, 616)));
    act(() => h().onPointerUp(ev(100, 616)));
    expect(result.current.style.left).toBe(16); // grudou na margem esquerda
    expect(result.current.movedRef.current).toBe(true);
  });

  it('toque sem arrastar (<5px) não marca movedRef', () => {
    const { result } = renderHook(() => useDraggableFab({ storageKey: 'fab-c' }));
    const h = () => result.current.pointerHandlers as any;
    act(() => h().onPointerDown(ev(952, 616)));
    act(() => h().onPointerMove(ev(954, 617)));
    act(() => h().onPointerUp(ev(954, 617)));
    expect(result.current.movedRef.current).toBe(false);
  });
});
