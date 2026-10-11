import fs from 'fs';
import path from 'path';
import { themeForPath, LIGHT_ROUTES } from '../routeTheme';

const PAGES = path.join(__dirname, '..', '..', 'pages');

function pageRoutes(dir = PAGES, base = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === 'api' ? [] : pageRoutes(path.join(dir, e.name), `${base}/${e.name}`);
    if (!/\.tsx?$/.test(e.name) || /^_(app|document)\./.test(e.name)) return [];
    const name = e.name.replace(/\.tsx?$/, '');
    return [name === 'index' ? base || '/' : `${base}/${name}`];
  });
}
const sampleUrl = (pattern: string) => pattern.replace(/\[\.\.\.[^\]]+\]/g, 'a/b').replace(/\[[^\]]+\]/g, 'x1');
const routes = Array.from(new Set(pageRoutes()));

describe('tema por rota × páginas reais', () => {
  it('padrão do router (hook) e URL real (boot script) dão o mesmo tema em toda página', () => {
    expect(routes.filter((p) => themeForPath(p) !== themeForPath(sampleUrl(p)))).toEqual([]);
  });
  it('rota fora da lista clara continua escura (padrão dinâmico claro não engole irmã estática)', () => {
    const light = new Set(LIGHT_ROUTES);
    expect(routes.filter((p) => !light.has(p) && themeForPath(p) === 'light')).toEqual([]);
  });
  it('toda entrada da lista clara é uma página que existe', () => {
    expect(LIGHT_ROUTES.filter((r) => !routes.includes(r))).toEqual([]);
  });
});
