/**
 * D3a · CSS e estilo do admin no DS v2 (spec 3.6 e regras do plano).
 * 1) Todo *.module.css de components/admin/** é estrito: sem hex, rgba/hsla, token antigo, gradiente.
 * 2) Sem style={{ em components/admin/**.
 * 3) Página de /admin já migrada (fora de ADMIN_LEGACY_SHELL_ROUTES): sem style={{ e os ./*.module.css que ela
 *    importa também estritos. As páginas antigas entram aqui sozinhas quando saem da lista.
 */
import fs from 'fs';
import path from 'path';
import { cssViolations } from './helpers/dsTokens';
import { ADMIN_LEGACY_SHELL_ROUTES } from '../lib/adminLegacyShell';

const ROOT = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));

const walk = (rel: string, re: RegExp): string[] => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__') return [];
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return walk(child, re);
    return re.test(e.name) ? [child] : [];
  });
};

const strictReport = (files: string[]) => files
  .map((f) => {
    const rgba = noComments(read(f)).split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /rgba?\(|hsla?\(/.test(line))
      .map(({ line, n }) => `${n}: ${line.trim()}`);
    return { f, v: [...cssViolations(read(f)), ...rgba] };
  })
  .filter((x) => x.v.length)
  .map((x) => `${x.f}\n  ${x.v.join('\n  ')}`)
  .join('\n');

const inlineStyle = (files: string[]) => files
  .flatMap((f) => read(f).split('\n').map((line, i) => ({ f, line, n: i + 1 })))
  .filter(({ line }) => /style=\{\{/.test(line))
  .map(({ f, line, n }) => `${f}:${n}: ${line.trim()}`);

const migratedPages = fs.readdirSync(path.join(ROOT, 'pages', 'admin'))
  .filter((f) => /\.tsx$/.test(f))
  .filter((f) => !ADMIN_LEGACY_SHELL_ROUTES.includes(`/admin/${f.replace(/\.tsx$/, '')}`))
  .map((f) => `pages/admin/${f}`);

const importedCss = (page: string) =>
  Array.from(read(page).matchAll(/from\s+'(\.\/[^']+\.module\.css)'/g), (m) => path.posix.join(path.posix.dirname(page), m[1]));

it('CSS de components/admin segue o DS v2 (só tokens)', () => {
  const files = walk('components/admin', /\.module\.css$/);
  expect(files.length).toBeGreaterThan(0);
  expect(strictReport(files)).toBe('');
});

it('sem style={{ em components/admin', () => {
  expect(inlineStyle(walk('components/admin', /\.tsx$/))).toEqual([]);
});

it('páginas de /admin já migradas: sem style={{ e CSS importado estrito', () => {
  expect(inlineStyle(migratedPages)).toEqual([]);
  expect(strictReport(migratedPages.flatMap(importedCss))).toBe('');
});
