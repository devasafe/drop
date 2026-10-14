// D2 · CSS do painel do motoboy. Varre sozinho os blocos de painel e as pastas de tela novas do motoboy:
// a task que cria um CSS nessas pastas já fica coberta, sem acrescentar arquivo aqui.
// 1) DS v2 estrito: sem hex, token antigo, gradiente, glow, rgba/hsla (cor só por --color-*).
// 2) Uma margem só: a casca (PanelShell) é dona do respiro horizontal; .page/.body/.container não somam padding.
import fs from 'fs';
import path from 'path';
import { cssViolations } from './helpers/dsTokens';

const ROOT = path.join(__dirname, '..');
const DIRS = ['panel', 'corridas', 'corrida', 'entregas', 'ganhos', 'nivel', 'perfil', 'cadastro']
  .map((d) => path.join('components', 'motoboy', d));

const walk = (rel: string): string[] => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__') return [];
    const child = path.join(rel, e.name);
    if (e.isDirectory()) return walk(child);
    return e.name.endsWith('.module.css') ? [child] : [];
  });
};
const FILES = ['components/panel/PanelBlocks.module.css', ...DIRS.flatMap(walk)];
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));

it('CSS do painel do motoboy segue o DS v2 (só tokens)', () => {
  const report = FILES
    .map((f) => {
      const rgba = noComments(read(f)).split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /rgba?\(|hsla?\(/.test(line))
        .map(({ line, n }) => `${n}: ${line.trim()}`);
      return { f, v: [...cssViolations(read(f)), ...rgba] };
    })
    .filter((x) => x.v.length)
    .map((x) => `${x.f}\n  ${x.v.join('\n  ')}`);
  expect(report.join('\n')).toBe('');
});

const SELECTORS = new Set(['.page', '.body', '.container']);
const rules = (css: string) => {
  const out: { sel: string; decls: Record<string, string> }[] = [];
  for (const m of noComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Record<string, string> = {};
    m[2].split(';').forEach((d) => {
      const i = d.indexOf(':');
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });
    m[1].split(',').map((s) => s.trim()).forEach((sel) => out.push({ sel, decls }));
  }
  return out;
};
const zero = (v: string) => /^0(px)?$/.test(v);
const horizontalOfPadding = (v: string): string[] => {
  const p = v.trim().split(/\s+(?![^(]*\))/);
  if (p.length === 1) return [p[0]];
  if (p.length === 4) return [p[1], p[3]];
  return [p[1]];
};

it('uma margem só: nenhum .page/.body/.container de tela do motoboy soma padding horizontal', () => {
  const found = FILES.flatMap((f) => rules(read(f))
    .filter(({ sel }) => SELECTORS.has(sel))
    .flatMap(({ sel, decls }) => {
      const h: string[] = [];
      if (decls.padding) h.push(...horizontalOfPadding(decls.padding));
      for (const k of ['padding-inline', 'padding-left', 'padding-right']) if (decls[k]) h.push(...decls[k].split(/\s+/));
      return h.some((v) => !zero(v)) ? [`${f} ${sel}: padding horizontal diferente de 0 (a PanelShell é a dona)`] : [];
    }));
  expect(found.join('\n')).toBe('');
});
