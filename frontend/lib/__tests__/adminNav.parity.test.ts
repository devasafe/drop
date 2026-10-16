/**
 * D3a · a tabela nova do menu tem a MESMA permissão e o MESMO filtro de modo do menu antigo (lib/adminMenu.ts)
 * e da proteção de cada página (ProtectedRoute ou can() + redirect). Nenhuma permissão muda na D3a.
 * Permissão da aba é comparada por tabPermissions (string ou lista: qualquer uma basta).
 * Sai na P5 junto com lib/adminMenu.ts.
 */
import fs from 'fs';
import path from 'path';
import { ADMIN_MENU } from '../adminMenu';
import { ADMIN_AREAS, tabPermissions, type AdminTab } from '../adminNav';

/** Aba que mudou de endereço de propósito (página fundida em outra): href antigo → href novo. */
const PARITY_MOVED: Record<string, string> = {
  '/admin/ranking-config': '/admin/settings?aba=ranking',
  '/admin/conversas': '/admin/suporte',
};

/** Permissões que a aba de uma página que ficou ganhou de propósito numa fusão (D1): href → permissões a mais. */
const PARITY_MERGED: Record<string, string[]> = {
  // D1: /admin/conversas virou o filtro "Conversas entre usuários" de /admin/suporte.
  '/admin/suporte': ['conversations:view_all'],
};

const PAGES = path.join(__dirname, '..', '..', 'pages');
const tabs = ADMIN_AREAS.flatMap((a) => a.tabs);
const modeFlags = (x: { ceoOnly?: boolean; custodyOnly?: boolean; directOnly?: boolean; whileCustodyOpen?: boolean }) => ({
  ceoOnly: !!x.ceoOnly,
  custodyOnly: !!x.custodyOnly,
  directOnly: !!x.directOnly,
  whileCustodyOpen: !!x.whileCustodyOpen,
});
const sorted = (xs: string[]) => [...xs].sort();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('paridade com o menu antigo', () => {
  it.each(ADMIN_MENU.map((m) => [m.href, m] as const))('%s: mesma permissão e mesmo filtro de modo', (href, m) => {
    const moved = PARITY_MOVED[href];
    const target = moved ?? href;
    const t = tabs.find((x) => x.href === target);
    expect(t).toBeDefined();
    expect(modeFlags(t!)).toEqual(modeFlags(m));
    const old = m.permission ? [m.permission] : [];
    if (moved) {
      // página fundida: a aba de destino aceita a permissão antiga (pode aceitar a da página que ficou)
      expect(tabPermissions(t!)).toEqual(expect.arrayContaining(old));
    } else {
      expect(sorted(tabPermissions(t!))).toEqual(sorted([...old, ...(PARITY_MERGED[href] ?? [])]));
    }
  });

  it('toda aba sem ?aba= é uma página do menu antigo (nada entra sem decisão)', () => {
    const old = new Set(ADMIN_MENU.map((m) => PARITY_MOVED[m.href] ?? m.href));
    expect(tabs.filter((t) => !t.href.includes('?') && !old.has(t.href)).map((t) => t.href)).toEqual([]);
  });

  it('PARITY_MERGED só cita abas que existem e sem ?aba=', () => {
    for (const href of Object.keys(PARITY_MERGED)) {
      expect(href).not.toContain('?');
      expect(tabs.some((t) => t.href === href)).toBe(true);
    }
  });
});

describe('paridade com a proteção de cada página', () => {
  const plain = tabs.filter((t) => !t.href.includes('?'));
  it.each(plain.map((t) => [t.href, t] as const))('%s', (href: string, t: AdminTab) => {
    const file = path.join(PAGES, `${href}.tsx`);
    expect(fs.existsSync(file)).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    if (t.ceoOnly) {
      expect(src).toMatch(/required_role="ceo"/);
      return;
    }
    for (const p of tabPermissions(t)) {
      const q = esc(p);
      expect(src).toMatch(new RegExp(`required_permission="${q}"|required_permission=\\{\\[[^\\]]*'${q}'|can\\('${q}'\\)`));
    }
  });
});
