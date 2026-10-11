import { applyTheme } from '../applyTheme';

function fakeMap() {
  const handlers: Record<string, Set<() => void>> = {};
  return {
    handlers,
    setStyle: jest.fn(),
    once: jest.fn((e: string, h: () => void) => { (handlers[e] ||= new Set()).add(h); }),
    off: jest.fn((e: string, h: () => void) => { handlers[e]?.delete(h); }),
    fire(e: string) { [...(handlers[e] || [])].forEach((h) => { handlers[e].delete(h); h(); }); },
  };
}

it('chama setStyle com diff:false', () => {
  const m = fakeMap();
  applyTheme(m as any, 'light', 'k', jest.fn());
  expect(m.setStyle).toHaveBeenCalledWith(expect.anything(), { diff: false });
});
it('chamadas rápidas não acumulam handlers', () => {
  const m = fakeMap();
  const cb = jest.fn();
  applyTheme(m as any, 'light', 'k', cb);
  applyTheme(m as any, 'dark', 'k', cb);
  applyTheme(m as any, 'light', 'k', cb);
  expect(m.handlers['style.load'].size).toBe(1);
  m.fire('style.load');
  expect(cb).toHaveBeenCalledTimes(1);
});
it('style.load dispara onReloaded', () => {
  const m = fakeMap();
  const cb = jest.fn();
  applyTheme(m as any, 'dark', 'k', cb);
  expect(cb).not.toHaveBeenCalled();
  m.fire('style.load');
  expect(cb).toHaveBeenCalledTimes(1);
});
