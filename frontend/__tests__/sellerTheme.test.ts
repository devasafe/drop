import fs from 'fs';
import path from 'path';
import { themeForPath, SELLER_LIGHT_ROUTES, LIGHT_ROUTES } from '../lib/routeTheme';

const SELLER = path.join(__dirname, '..', 'pages', 'seller');
function sellerPages(dir = SELLER, base = '/seller'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return sellerPages(path.join(dir, e.name), `${base}/${e.name}`);
    if (!/\.tsx?$/.test(e.name)) return [];
    const name = e.name.replace(/\.tsx?$/, '');
    return [name === 'index' ? base : `${base}/${name}`];
  });
}

describe('tema do painel da loja (D1)', () => {
  it('toda página de /seller é clara (página nova entra em SELLER_LIGHT_ROUTES)', () => {
    expect(sellerPages().filter((r) => themeForPath(r) !== 'light')).toEqual([]);
  });

  it('as telas só da loja fora de /seller também são claras', () => {
    for (const r of ['/store-dashboard', '/verificacao-loja']) expect(themeForPath(r)).toBe('light');
  });

  it('/dados-recebimento é clara para loja e motoboy (decisão do usuário na V7)', () => {
    expect(themeForPath('/dados-recebimento')).toBe('light');
  });

  it('URL real de um pedido também é clara (o boot script recebe a URL, não o padrão)', () => {
    expect(themeForPath('/seller/pedido/abc123')).toBe('light');
  });

  it('rotas compartilhadas com outros papéis e os outros painéis continuam escuros', () => {
    for (const r of ['/verificacao', '/notifications', '/motoboy', '/motoboy/wallet', '/admin/dashboard']) {
      expect(themeForPath(r)).toBe('dark');
    }
  });

  it('a lista da loja faz parte da lista clara', () => {
    expect(LIGHT_ROUTES).toEqual(expect.arrayContaining(SELLER_LIGHT_ROUTES));
  });
});
