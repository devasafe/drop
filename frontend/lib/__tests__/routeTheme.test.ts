import { themeForPath, resolvedThemeForPath, LIGHT_ROUTES, THEME_BOOT_SCRIPT, patternToRegex } from '../routeTheme';

describe('routeTheme', () => {
  it('rota fora da lista é escura (padrão até a fase C)', () => {
    expect(themeForPath('/notifications')).toBe('dark');
  });
  it('o painel do motoboy é noturno automático (D2)', () => {
    expect(themeForPath('/motoboy')).toBe('night-auto');
  });
  it('styleguide é clara', () => {
    expect(LIGHT_ROUTES).toContain('/_styleguide');
    expect(themeForPath('/_styleguide')).toBe('light');
  });
  it('padrão dinâmico casa com a URL real (o boot script recebe location.pathname, não o pattern)', () => {
    const re = patternToRegex('/stores/[id]');
    expect(re.test('/stores/abc123')).toBe(true);
    expect(re.test('/stores/abc/extra')).toBe(false);
  });
  it('o boot script aplica o mesmo resultado que resolvedThemeForPath', () => {
    jest.useFakeTimers();
    try {
      for (const [h, prefOn] of [[12, true], [20, true], [20, false]] as const) {
        const now = new Date(2026, 9, 14, h, 0, 0, 0);
        jest.setSystemTime(now);
        localStorage.setItem('drop.motoboy.nightMode', prefOn ? '1' : '0');
        for (const path of ['/_styleguide', '/inicio', '/admin/freios', '/motoboy', '/motoboy/delivery/abc', '/dados-recebimento']) {
          document.documentElement.removeAttribute('data-theme');
          new Function('location', THEME_BOOT_SCRIPT)({ pathname: path });
          expect(document.documentElement.getAttribute('data-theme')).toBe(resolvedThemeForPath(path, now, prefOn));
        }
      }
    } finally {
      jest.useRealTimers();
      localStorage.clear();
    }
  });
});
