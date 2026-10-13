import fs from 'fs';
import path from 'path';
import { resolveRedirect } from './helpers/nextRedirects';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rules = require('../lib/redirects.js');
const ROOT = path.join(__dirname, '..');

test('o código da tela antiga do painel saiu', () => {
  for (const f of [
    'pages/StoreDashboard.module.css',
    'components/seller/OverviewTab.tsx',
    'components/seller/OverviewTab.module.css',
    'components/seller/OrderCard.tsx',
    'components/seller/OrderCard.module.css',
  ]) {
    expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
  }
});

test('store-dashboard ficou só como apontador para o Agora', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages', 'store-dashboard.tsx'), 'utf8');
  expect(src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length).toBeLessThanOrEqual(3);
  expect(src).not.toMatch(/OverviewTab|OrderCard|useSocketListener|window\.confirm/);
});

test('as URLs antigas (pushes já entregues) continuam chegando no Agora', () => {
  expect(resolveRedirect(rules, '/store-dashboard')?.location).toBe('/seller/dashboard');
});
