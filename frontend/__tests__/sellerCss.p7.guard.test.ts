// frontend/__tests__/sellerCss.p7.guard.test.ts
import fs from 'fs';
import path from 'path';
import { cssViolations } from './helpers/dsTokens';

// D1 · P7 — CSS das telas da loja (grupos 5 a 8). Cada task de tela acrescenta o seu arquivo.
// STRICT: escrito do zero no DS v2 (sem cor fixa, token antigo, gradiente nem rgba/hsla).
// FIXED_COLOR: CSS antigo que só trocou as cores fixas por token (sem hex, rgba nem hsla).
const ROOT = path.join(__dirname, '..');
const STRICT: string[] = ['components/seller/ui/SellerBlocks.module.css', 'components/OperatingHoursEditor.module.css', 'pages/seller/SellerLoja.module.css', 'pages/seller/Analytics.module.css'];
const FIXED_COLOR: string[] = [];

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const hits = (css: string, re: RegExp) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => re.test(line))
    .map(({ line, n }) => `${n}: ${line.trim()}`);

it('CSS novo da loja segue o DS v2', () => {
  const report = STRICT
    .map((f) => ({ f, v: [...cssViolations(read(f)), ...hits(read(f), /rgba?\(|hsla?\(/)] }))
    .filter((x) => x.v.length)
    .map((x) => `${x.f}\n  ${x.v.join('\n  ')}`);
  expect(report.join('\n')).toBe('');
});

it('CSS antigo da loja não tem mais cor fixa', () => {
  const report = FIXED_COLOR
    .map((f) => ({ f, v: hits(read(f), /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/) }))
    .filter((x) => x.v.length)
    .map((x) => `${x.f}\n  ${x.v.join('\n  ')}`);
  expect(report.join('\n')).toBe('');
});
