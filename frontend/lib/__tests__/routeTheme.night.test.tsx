import { act, render } from '@testing-library/react';
import { useRouteTheme, resolvedThemeForPath, themeForPath, THEME_BOOT_SCRIPT, LIGHT_ROUTES, buildBootScript } from '../routeTheme';
import { DARK_PREF_KEY, writeDarkPref } from '../nightTheme';

let mockPathname = '/motoboy';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname }) }));

const at = (h: number, m: number) => new Date(2026, 9, 14, h, m, 0, 0);
const theme = () => document.documentElement.getAttribute('data-theme');
function Probe() { useRouteTheme(); return null; }

beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); mockPathname = '/motoboy'; });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('modo escuro manual do motoboy', () => {
  it('rotas do motoboy seguem a preferência; a etapa Pix continua clara; o perfil público não', () => {
    expect(themeForPath('/motoboy')).toBe('motoboy-pref');
    expect(themeForPath('/dados-recebimento')).toBe('light');
    expect(themeForPath('/motoboy/[id]')).not.toBe('motoboy-pref');
  });

  it('as do motoboy valem antes das claras: /motoboy/[id] em LIGHT_ROUTES não engole /motoboy/ranking (C9, P5.13)', () => {
    LIGHT_ROUTES.push('/motoboy/[id]');
    try {
      expect(themeForPath('/motoboy/ranking')).toBe('motoboy-pref');
      expect(themeForPath('/motoboy/x1')).toBe('light');
    } finally {
      LIGHT_ROUTES.pop();
    }
  });

  it('o script do <head> checa as do motoboy antes das claras (executa o script gerado com as listas trocadas)', () => {
    const script = buildBootScript(['/motoboy/ranking'], ['/motoboy/[id]']);
    const roda = (pathname: string) => {
      const attrs: Record<string, string> = {};
      const doc = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
      const ls = { getItem: () => '1' };
      new Function('document', 'location', 'localStorage', script)(doc, { pathname }, ls);
      return attrs['data-theme'];
    };
    expect(roda('/motoboy/ranking')).toBe('dark');
    expect(roda('/motoboy/x1')).toBe('light');
  });

  it.each([
    [12, 0, null, 'light'], [20, 0, null, 'light'], [3, 0, null, 'light'],
    [12, 0, '1', 'dark'], [20, 0, '1', 'dark'],
    [12, 0, '0', 'light'], [20, 0, '0', 'light'],
  ])('%i:%i com a preferência %p → %s, a qualquer hora (hook e script do <head> concordam)', (h, m, pref, esperado) => {
    jest.setSystemTime(at(h, m));
    if (pref !== null) localStorage.setItem(DARK_PREF_KEY, pref);
    expect(resolvedThemeForPath('/motoboy', pref === '1')).toBe(esperado);

    document.documentElement.removeAttribute('data-theme');
    new Function('location', THEME_BOOT_SCRIPT)({ pathname: '/motoboy' });
    expect(theme()).toBe(esperado);

    document.documentElement.removeAttribute('data-theme');
    const { unmount } = render(<Probe />);
    expect(theme()).toBe(esperado);
    unmount();
  });

  it('com a tela aberta, a virada das 18:00 não muda nada', () => {
    jest.setSystemTime(at(17, 59));
    render(<Probe />);
    expect(theme()).toBe('light');
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(theme()).toBe('light');
  });

  it('ligar o modo escuro no Perfil escurece na hora; desligar clareia de volta', () => {
    jest.setSystemTime(at(12, 0));
    render(<Probe />);
    expect(theme()).toBe('light');
    act(() => { writeDarkPref(true); });
    expect(theme()).toBe('dark');
    act(() => { writeDarkPref(false); });
    expect(theme()).toBe('light');
  });

  it('a preferência mudada em outra aba vale nesta', () => {
    render(<Probe />);
    expect(theme()).toBe('light');
    localStorage.setItem(DARK_PREF_KEY, '1');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: DARK_PREF_KEY })); });
    expect(theme()).toBe('dark');
  });

  it('fora do painel do motoboy a preferência não mexe no tema do cliente', () => {
    const { rerender } = render(<Probe />);
    mockPathname = '/inicio';
    rerender(<Probe />);
    expect(theme()).toBe('light');
    act(() => { writeDarkPref(true); });
    expect(theme()).toBe('light');
  });

  it('armazenamento bloqueado: hook e script valem o padrão (claro) e não quebram', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    document.documentElement.removeAttribute('data-theme');
    new Function('location', THEME_BOOT_SCRIPT)({ pathname: '/motoboy' });
    expect(theme()).toBe('light');
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<Probe />);
    expect(theme()).toBe('light');
  });
});
