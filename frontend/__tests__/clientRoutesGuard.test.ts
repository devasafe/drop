// __tests__/clientRoutesGuard.test.ts
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const CLIENT_FILES = [
  'pages/inicio.tsx', 'pages/buscar.tsx', 'pages/loja/[id].tsx', 'pages/produto/[id].tsx', 'pages/sacola.tsx',
  'pages/pedido/[id].tsx', 'pages/pedidos.tsx', 'pages/conta/index.tsx', 'pages/conta/carteira.tsx', 'pages/categoria/[nome].tsx', 'pages/pedido/[id]/conversa.tsx', 'pages/pedido/[id]/recibo.tsx',
  'components/Nav.tsx', 'components/Footer.tsx', 'components/nav/AccountMenu.tsx',
];
function walk(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'asaas' || e.name === 'settlement' ? [] : walk(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}
const files = [...CLIENT_FILES, ...walk('components/drop'), ...walk('hooks'), ...walk('contexts')];

// Navegação (push/replace/href) para uma rota antiga do cliente.
const OLD_NAV = /(router\.(?:push|replace)\(|href=\{?|href:\s*)\s*[`'"]\/(?:stores(?:[`'"?/])|product\/|store-order\/|checkout(?:-vitrine)?[`'"?]|user-dashboard|wallet[`'"?]|my-wallet|minha-conta|user-profile|produtos[`'"?]|[`'"?])/;
// Sem exceções: o redirect legado do useCheckout para /checkout-vitrine (redirectPlan1) saiu.
const EXCEPTIONS = new Set<string>();

it('nenhuma tela ou componente do cliente navega para rota antiga', () => {
  const hits: string[] = [];
  for (const f of files) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
      const m = OLD_NAV.exec(line);
      if (!m) return;
      const key = `${f}:${line.trim().match(/router\.\w+\([^)]*\)/)?.[0] ?? ''}`;
      if (!EXCEPTIONS.has(key)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(hits).toEqual([]);
});
