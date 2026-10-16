/**
 * D3a · nada do painel antigo do admin sobrou: o menu antigo, as rotas que viraram redirect e os componentes
 * que só o analytics usava. Se falhar, o resto volta para a task dona (com commit próprio).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DIRS = ['pages', 'components', 'lib', 'hooks', 'contexts'];

const walk = (rel: string): string[] => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__' || e.name === 'node_modules') return [];
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return walk(child);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [child] : [];
  });
};
const files = DIRS.flatMap(walk);
const grep = (re: RegExp, except: string[] = []) => files
  .filter((f) => !except.includes(f))
  .flatMap((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')
    .map((line, i) => ({ f, line, n: i + 1 }))
    .filter(({ line }) => re.test(line))
    .map(({ f: file, line, n }) => `${file}:${n}: ${line.trim()}`));

test('ninguém mais usa o menu antigo do admin', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib', 'adminMenu.ts'))).toBe(false);
  expect(grep(/adminMenu|visibleAdminMenu|ADMIN_MENU\b|ADMIN_GROUP\b|getNavItems\('ceo'/)).toEqual([]);
});

test('nenhuma tela aponta para as rotas que viraram redirect', () => {
  expect(grep(/\/admin\/(analytics|conversas|ranking-config|pricing-config)\b/, ['lib/redirects.js'])).toEqual([]);
});

test('do analytics antigo só sobrou o mapa ao vivo (usado em Números do negócio)', () => {
  const left = fs.readdirSync(path.join(ROOT, 'components', 'analytics')).filter((f) => /\.tsx$/.test(f));
  expect(left).toEqual(['LiveUsersMap.tsx']);
});

test('o link quebrado /admin/order/{id} do caixa antigo não voltou', () => {
  expect(grep(/\/admin\/order\//)).toEqual([]);
});
