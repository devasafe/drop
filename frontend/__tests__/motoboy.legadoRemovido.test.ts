// frontend/__tests__/motoboy.legadoRemovido.test.ts
import fs from 'fs';
import path from 'path';
import { resolveRedirect } from './helpers/nextRedirects';

const rules = require('../lib/redirects.js');
const ROOT = path.join(__dirname, '..');

/** URL antiga → destino novo (contrato da D2). Pushes já entregues continuam abrindo a tela certa. */
const OLD: Array<[string, string]> = [
  ['/motoboy/ongoing', '/motoboy/entregas?seg=andamento'],
  ['/motoboy/ongoing?tab=history', '/motoboy/entregas?seg=concluidas&tab=history'],
  ['/motoboy/history', '/motoboy/entregas?seg=concluidas'],
  ['/motoboy/delivery/d1', '/motoboy/corrida/d1'],
  ['/motoboy/delivery/d1?nav=1', '/motoboy/corrida/d1?nav=1'],
  ['/motoboy/wallet', '/motoboy/ganhos'],
  ['/motoboy/request-withdrawal', '/motoboy/ganhos'],
  ['/motoboy/transfer-wallet', '/motoboy/ganhos'],
  ['/motoboy/ajuda-ganhos', '/motoboy/ganhos/como-calculamos'],
  ['/motoboy/gamification', '/motoboy/nivel'],
  ['/motoboy/beneficios', '/motoboy/nivel'],
  ['/motoboy/profile', '/motoboy/perfil'],
  ['/verificacao-motoboy', '/motoboy/cadastro'],
];

test.each(OLD)('%s redireciona (308) para %s', (from, to) => {
  expect(resolveRedirect(rules, from)).toEqual({ location: to, permanent: true });
});

test('as páginas antigas do motoboy saíram (redirect e página não convivem)', () => {
  for (const f of [
    'pages/motoboy/ongoing.tsx', 'pages/motoboy/history.tsx', 'pages/motoboy/delivery/[id].tsx',
    'pages/motoboy/wallet.tsx', 'pages/motoboy/request-withdrawal.tsx', 'pages/motoboy/transfer-wallet.tsx',
    'pages/motoboy/ajuda-ganhos.tsx', 'pages/motoboy/gamification.tsx', 'pages/motoboy/beneficios.tsx',
    'pages/motoboy/profile.tsx', 'pages/verificacao-motoboy.tsx',
  ]) {
    expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
  }
});

test('todo destino da D2 é uma página que existe', () => {
  const d2 = rules.filter((r: any) => r.source.startsWith('/motoboy') || r.source === '/verificacao-motoboy');
  expect(d2.length).toBeGreaterThanOrEqual(12);
  const missing = d2
    .map((r: any) => r.destination.split('?')[0].replace(/:(\w+)/g, '[$1]'))
    .filter((p: string) => !fs.existsSync(path.join(ROOT, 'pages', `${p}.tsx`)) && !fs.existsSync(path.join(ROOT, 'pages', p, 'index.tsx')));
  expect(missing).toEqual([]);
});
