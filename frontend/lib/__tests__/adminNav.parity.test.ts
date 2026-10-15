/**
 * D3a · a tabela nova do menu tem a MESMA permissão e o MESMO filtro de modo do menu antigo (lib/adminMenu.ts)
 * e da proteção de cada página (ProtectedRoute ou can() + redirect). Nenhuma permissão muda na D3a.
 * Sai na P5 junto com lib/adminMenu.ts.
 */
import fs from 'fs';
import path from 'path';
import { ADMIN_MENU } from '../adminMenu';
import { ADMIN_AREAS } from '../adminNav';

/** Aba que mudou de endereço de propósito (página fundida em outra): href antigo → href novo. */
const PARITY_MOVED: Record<string, string> = {};

const PAGES = path.join(__dirname, '..', '..', 'pages');
const tabs = ADMIN_AREAS.flatMap((a) => a.tabs);
const flags = (x: { permission?: string; ceoOnly?: boolean; custodyOnly?: boolean; directOnly?: boolean; whileCustodyOpen?: boolean }) => ({
  permission: x.permission,
  ceoOnly: !!x.ceoOnly,
  custodyOnly: !!x.custodyOnly,
  directOnly: !!x.directOnly,
  whileCustodyOpen: !!x.whileCustodyOpen,
});

describe('paridade com o menu antigo', () => {
  it.each(ADMIN_MENU.map((m) => [m.href, m] as const))('%s: mesma permissão e mesmo filtro de modo', (href, m) => {
    const target = PARITY_MOVED[href] ?? href;
    const t = tabs.find((x) => x.href === target);
    expect(t).toBeDefined();
    expect(flags(t!)).toEqual(flags(m));
  });

  it('toda aba sem ?aba= é uma página do menu antigo (nada entra sem decisão)', () => {
    const old = new Set(ADMIN_MENU.map((m) => PARITY_MOVED[m.href] ?? m.href));
    expect(tabs.filter((t) => !t.href.includes('?') && !old.has(t.href)).map((t) => t.href)).toEqual([]);
  });
});

describe('paridade com a proteção de cada página', () => {
  const plain = tabs.filter((t) => !t.href.includes('?'));
  it.each(plain.map((t) => [t.href, t] as const))('%s', (href, t) => {
    const file = path.join(PAGES, `${href}.tsx`);
    expect(fs.existsSync(file)).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    if (t.ceoOnly) {
      expect(src).toMatch(/required_role="ceo"/);
    } else {
      const p = t.permission!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(src).toMatch(new RegExp(`required_permission="${p}"|can\\('${p}'\\)`));
    }
  });
});
