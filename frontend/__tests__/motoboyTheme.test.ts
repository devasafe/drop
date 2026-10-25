import fs from 'fs';
import path from 'path';
import { themeForPath, MOTOBOY_NIGHT_ROUTES, LIGHT_ROUTES } from '../lib/routeTheme';

const MOTOBOY = path.join(__dirname, '..', 'pages', 'motoboy');
function motoboyPages(dir = MOTOBOY, base = '/motoboy'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return motoboyPages(path.join(dir, e.name), `${base}/${e.name}`);
    if (!/\.tsx?$/.test(e.name)) return [];
    const name = e.name.replace(/\.tsx?$/, '');
    return [name === 'index' ? base : `${base}/${name}`];
  });
}
const sampleUrl = (p: string) => p.replace(/\[\.\.\.[^\]]+\]/g, 'a/b').replace(/\[[^\]]+\]/g, 'x1');

describe('tema do painel do motoboy (D2)', () => {
  it('toda página de /motoboy, menos o perfil público, segue o modo escuro do motoboy (página nova entra em MOTOBOY_NIGHT_ROUTES)', () => {
    expect(motoboyPages().filter((r) => r !== '/motoboy/[id]' && themeForPath(r) !== 'motoboy-pref')).toEqual([]);
  });

  it('URL real das rotas com id também é noturna (o script do <head> recebe a URL)', () => {
    const dinamicas = MOTOBOY_NIGHT_ROUTES.filter((r) => r.includes('['));
    expect(dinamicas.filter((r) => themeForPath(sampleUrl(r)) !== 'motoboy-pref')).toEqual([]);
  });

  it('/dados-recebimento continua clara (V7) e o admin é claro, nunca noturno (D3a)', () => {
    expect(themeForPath('/dados-recebimento')).toBe('light');
    expect(themeForPath('/admin/dashboard')).toBe('light');
  });

  it('a lista noturna não se mistura com a clara', () => {
    expect(MOTOBOY_NIGHT_ROUTES.filter((r) => LIGHT_ROUTES.includes(r))).toEqual([]);
  });
});
