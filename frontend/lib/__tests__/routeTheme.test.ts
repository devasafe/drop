import { themeForPath, LIGHT_ROUTES, THEME_BOOT_SCRIPT, patternToRegex } from '../routeTheme';

describe('routeTheme', () => {
  it('rota fora da lista é escura (padrão até a fase C)', () => {
    expect(themeForPath('/notifications')).toBe('dark');
    expect(themeForPath('/seller/dashboard')).toBe('dark');
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
  it('o boot script aplica o mesmo resultado que themeForPath', () => {
    for (const path of ['/_styleguide', '/inicio', '/admin/freios']) {
      document.documentElement.removeAttribute('data-theme');
      new Function('location', THEME_BOOT_SCRIPT)({ pathname: path });
      expect(document.documentElement.getAttribute('data-theme')).toBe(themeForPath(path));
    }
  });
});
