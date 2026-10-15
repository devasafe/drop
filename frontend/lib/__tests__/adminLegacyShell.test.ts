/**
 * D3a · páginas do admin que ainda não montam o AdminShell recebem a casca do _app.
 * Cada task de tela tira a página da lista no mesmo commit em que ela passa a montar o AdminShell.
 */
import fs from 'fs';
import path from 'path';
import { ADMIN_LEGACY_SHELL_ROUTES, adminLegacyShellTitle } from '../adminLegacyShell';
import { adminScreenTitle } from '../adminNav';

const ADMIN_DIR = path.join(__dirname, '..', '..', 'pages', 'admin');
const pages = fs.readdirSync(ADMIN_DIR).filter((f) => /\.tsx$/.test(f));
const routeOf = (file: string) => `/admin/${file.replace(/\.tsx$/, '')}`;
const usesShell = (file: string) => /components\/admin\/AdminShell/.test(fs.readFileSync(path.join(ADMIN_DIR, file), 'utf8'));

describe('ADMIN_LEGACY_SHELL_ROUTES', () => {
  it('toda rota da lista é uma página que existe (página apagada sai da lista)', () => {
    const routes = pages.map(routeOf);
    expect(ADMIN_LEGACY_SHELL_ROUTES.filter((r) => !routes.includes(r))).toEqual([]);
  });

  it('página da lista não monta o AdminShell (senão a casca fica dupla)', () => {
    expect(pages.filter((f) => ADMIN_LEGACY_SHELL_ROUTES.includes(routeOf(f)) && usesShell(f))).toEqual([]);
  });

  it('página fora da lista monta o AdminShell (senão fica sem menu)', () => {
    expect(pages.filter((f) => !ADMIN_LEGACY_SHELL_ROUTES.includes(routeOf(f)) && !usesShell(f))).toEqual([]);
  });

  // Sem rota fixa: as tasks das telas tiram rotas da lista (a P4.6 tira /admin/payouts; a P5.2, /admin/pricing-config).
  it('título da casca genérica = título da tela no menu', () => {
    for (const r of ADMIN_LEGACY_SHELL_ROUTES) expect(adminLegacyShellTitle(r)).toBe(adminScreenTitle(r));
    expect(adminLegacyShellTitle('/admin/rota-que-nao-existe')).toBeNull();
  });

  it('rota fora da lista não recebe a casca genérica', () => {
    const migrated = pages.map(routeOf).filter((r) => !ADMIN_LEGACY_SHELL_ROUTES.includes(r));
    for (const r of migrated) expect(adminLegacyShellTitle(r)).toBeNull();
  });
});
