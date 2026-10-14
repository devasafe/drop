// frontend/__tests__/sellerCss.margin.guard.test.ts
import fs from 'fs';
import path from 'path';

// D1 · uma margem só: a SellerShell é dona do respiro horizontal (16 px no celular, 24 px a partir de 900 px).
// Os .page/.body/.container das telas do painel não podem somar padding horizontal nem estourar a largura.
const ROOT = path.join(__dirname, '..');
const FILES = [
  'pages/seller/Agora.module.css',
  'pages/seller/PedidosLoja.module.css',
  'pages/seller/Produtos.module.css',
  'pages/seller/DinheiroPagina.module.css',
  'pages/seller/Estoque.module.css',
  'pages/seller/ProdutoPagina.module.css',
  'pages/seller/pedido/PedidoLoja.module.css',
  'pages/seller/Integrations.module.css',
  'components/panel/PanelBlocks.module.css',
];
const SELECTORS = new Set(['.page', '.body', '.container']);

const rules = (css: string) => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { sel: string; decls: Record<string, string> }[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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

// horizontal do shorthand: 1 valor = todos; 2 ou 3 = o 2º; 4 = 2º e 4º
const horizontalOfPadding = (v: string): string[] => {
  const p = v.trim().split(/\s+(?![^(]*\))/);
  if (p.length === 1) return [p[0]];
  if (p.length === 4) return [p[1], p[3]];
  return [p[1]];
};

const problems = (file: string) => {
  const found: string[] = [];
  const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const { sel, decls } of rules(css)) {
    if (!SELECTORS.has(sel)) continue;
    const h: string[] = [];
    if (decls.padding) h.push(...horizontalOfPadding(decls.padding));
    for (const k of ['padding-inline', 'padding-left', 'padding-right']) if (decls[k]) h.push(...decls[k].split(/\s+/));
    if (h.some((v) => !zero(v))) found.push(`${sel}: padding horizontal diferente de 0 (a SellerShell é a dona)`);
    const auto = decls['margin-inline'] === 'auto' || /^0\s+auto/.test(decls.margin || '') || decls.margin === 'auto';
    if (auto && decls.width !== '100%') found.push(`${sel}: margin auto sem width: 100%`);
    if (auto && decls['min-width'] !== '0') found.push(`${sel}: margin auto sem min-width: 0`);
  }
  return found.map((f) => `${file} ${f}`);
};

it('painel da loja: nenhum .page/.body soma padding horizontal ou estoura com margem automática', () => {
  expect(FILES.flatMap(problems).join('\n')).toBe('');
});
