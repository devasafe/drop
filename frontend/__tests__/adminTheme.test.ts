/**
 * D3a · o painel do admin é só claro (spec 3.6). Toda página de /admin está em ADMIN_LIGHT_ROUTES,
 * a lista faz parte da clara, e o script do <head> pinta de claro já na primeira carga, a qualquer hora.
 */
import fs from 'fs';
import path from 'path';
import { NIGHT_PREF_KEY } from '../lib/nightTheme';
import { themeForPath, LIGHT_ROUTES, ADMIN_LIGHT_ROUTES, MOTOBOY_NIGHT_ROUTES, THEME_BOOT_SCRIPT } from '../lib/routeTheme';

const ADMIN_DIR = path.join(__dirname, '..', 'pages', 'admin');
// D3b-3: lê as subpastas também (/admin/dinheiro/historico).
const routesUnder = (dir: string, base: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return routesUnder(path.join(dir, e.name), `${base}/${e.name}`);
  if (!/\.tsx?$/.test(e.name)) return [];
  const name = e.name.replace(/\.tsx?$/, '');
  return [name === 'index' ? base : `${base}/${name}`];
});
const adminPages = routesUnder(ADMIN_DIR, '/admin');

describe('tema do admin (D3a)', () => {
  it('toda página de /admin está na lista clara do admin', () => {
    expect(adminPages.filter((p) => !ADMIN_LIGHT_ROUTES.includes(p))).toEqual([]);
  });

  it('toda página de /admin é clara (padrão do router)', () => {
    expect(adminPages.filter((p) => themeForPath(p) !== 'light')).toEqual([]);
  });

  it('a lista do admin faz parte da lista clara e nunca da noturna', () => {
    expect(LIGHT_ROUTES).toEqual(expect.arrayContaining(ADMIN_LIGHT_ROUTES));
    expect(ADMIN_LIGHT_ROUTES.filter((r) => MOTOBOY_NIGHT_ROUTES.includes(r))).toEqual([]);
  });

  it('o script do <head> pinta o admin de claro de dia e à noite', () => {
    jest.useFakeTimers();
    try {
      for (const h of [12, 21]) {
        jest.setSystemTime(new Date(2026, 9, 15, h, 0, 0, 0));
        localStorage.setItem(NIGHT_PREF_KEY, '1');
        for (const p of ['/admin/dashboard', '/admin/payouts', '/admin/settings']) {
          document.documentElement.removeAttribute('data-theme');
          new Function('location', THEME_BOOT_SCRIPT)({ pathname: p });
          expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        }
      }
    } finally {
      jest.useRealTimers();
      localStorage.clear();
    }
  });

  it('rota fora do admin não muda (ex.: /notifications continua escura)', () => {
    expect(themeForPath('/notifications')).toBe('dark');
  });
});
