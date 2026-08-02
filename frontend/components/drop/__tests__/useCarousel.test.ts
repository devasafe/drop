import { renderHook, act } from '@testing-library/react';
import { useCarousel } from '../useCarousel';

// Evento de pointer falso (jsdom não despacha PointerEvent p/ o React, então
// exercitamos os handlers do hook diretamente).
const ev = (clientX: number) => ({ clientX, pointerId: 1, currentTarget: { setPointerCapture() {} } } as any);

describe('useCarousel (arrasto)', () => {
  it('swipe pra esquerda (>limiar) avança o índice', () => {
    const { result } = renderHook(() => useCarousel(3, 999999));
    const h = () => result.current.pointerHandlers as any;
    act(() => h().onPointerDown(ev(200)));
    act(() => h().onPointerMove(ev(60))); // -140px
    act(() => h().onPointerUp(ev(60)));
    expect(result.current.index).toBe(1);
  });

  it('swipe pra direita volta o índice (com wrap)', () => {
    const { result } = renderHook(() => useCarousel(3, 999999));
    const h = () => result.current.pointerHandlers as any;
    act(() => h().onPointerDown(ev(60)));
    act(() => h().onPointerMove(ev(200))); // +140px
    act(() => h().onPointerUp(ev(200)));
    expect(result.current.index).toBe(2); // 0 - 1 com wrap → último
  });

  it('arrasto curto (<40px) não muda o índice, mas marca movedRef', () => {
    const { result } = renderHook(() => useCarousel(3, 999999));
    const h = () => result.current.pointerHandlers as any;
    act(() => h().onPointerDown(ev(200)));
    act(() => h().onPointerMove(ev(190))); // -10px
    act(() => h().onPointerUp(ev(190)));
    expect(result.current.index).toBe(0);
    expect(result.current.movedRef.current).toBe(true);
  });
});
