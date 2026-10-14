import { act, render } from '@testing-library/react';
import { useRouteTheme, resolvedThemeForPath, themeForPath, THEME_BOOT_SCRIPT, LIGHT_ROUTES } from '../routeTheme';
import { NIGHT_PREF_KEY, writeNightPref } from '../nightTheme';

let mockPathname = '/motoboy';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname }) }));

const at = (h: number, m: number) => new Date(2026, 9, 14, h, m, 0, 0);
const theme = () => document.documentElement.getAttribute('data-theme');
function Probe() { useRouteTheme(); return null; }

beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); mockPathname = '/motoboy'; });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('tema noturno automático do motoboy (spec 3.4)', () => {
  it('rotas do motoboy são night-auto; a etapa Pix continua clara; o perfil público não é noturno', () => {
    expect(themeForPath('/motoboy')).toBe('night-auto');
    expect(themeForPath('/dados-recebimento')).toBe('light');
    expect(themeForPath('/motoboy/[id]')).not.toBe('night-auto');
  });

  it('noturnas valem antes das claras: /motoboy/[id] em LIGHT_ROUTES não engole /motoboy/ranking (C9, P5.13)', () => {
    LIGHT_ROUTES.push('/motoboy/[id]');
    try {
      expect(themeForPath('/motoboy/ranking')).toBe('night-auto');
      expect(themeForPath('/motoboy/x1')).toBe('light');
      jest.setSystemTime(at(20, 0));
      localStorage.setItem(NIGHT_PREF_KEY, '1');
      document.documentElement.removeAttribute('data-theme');
      new Function('location', THEME_BOOT_SCRIPT)({ pathname: '/motoboy/ranking' });
      expect(theme()).toBe('dark');
    } finally {
      LIGHT_ROUTES.pop();
    }
  });

  it.each([
    [17, 59, true, 'light'], [18, 0, true, 'dark'], [5, 59, true, 'dark'], [6, 0, true, 'light'],
    [17, 59, false, 'light'], [18, 0, false, 'light'], [5, 59, false, 'light'], [6, 0, false, 'light'],
  ])('%i:%i com a preferência %p → %s (hook e script do <head> concordam)', (h, m, prefOn, esperado) => {
    jest.setSystemTime(at(h, m));
    localStorage.setItem(NIGHT_PREF_KEY, prefOn ? '1' : '0');
    expect(resolvedThemeForPath('/motoboy', at(h, m), prefOn)).toBe(esperado);

    document.documentElement.removeAttribute('data-theme');
    new Function('location', THEME_BOOT_SCRIPT)({ pathname: '/motoboy' });
    expect(theme()).toBe(esperado);

    document.documentElement.removeAttribute('data-theme');
    const { unmount } = render(<Probe />);
    expect(theme()).toBe(esperado);
    unmount();
  });

  it('com a tela aberta, vira escuro às 18:00 e claro às 06:00 (timer até a próxima virada)', () => {
    jest.setSystemTime(at(17, 59));
    render(<Probe />);
    expect(theme()).toBe('light');
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(theme()).toBe('dark');
    act(() => { jest.advanceTimersByTime(12 * 60 * 60_000); });
    expect(theme()).toBe('light');
  });

  it('desligar a preferência no Perfil clareia na hora; ligar escurece de volta', () => {
    jest.setSystemTime(at(20, 0));
    render(<Probe />);
    expect(theme()).toBe('dark');
    act(() => { writeNightPref(false); });
    expect(theme()).toBe('light');
    act(() => { writeNightPref(true); });
    expect(theme()).toBe('dark');
  });

  it('ao sair do painel do motoboy o timer para (a virada não mexe no tema do cliente)', () => {
    jest.setSystemTime(at(17, 59));
    const { rerender } = render(<Probe />);
    mockPathname = '/inicio';
    rerender(<Probe />);
    expect(theme()).toBe('light');
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(theme()).toBe('light');
  });

  it('armazenamento bloqueado: hook e script valem o padrão (ligado) e não quebram', () => {
    jest.setSystemTime(at(20, 0));
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    document.documentElement.removeAttribute('data-theme');
    new Function('location', THEME_BOOT_SCRIPT)({ pathname: '/motoboy' });
    expect(theme()).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    render(<Probe />);
    expect(theme()).toBe('dark');
  });
});
