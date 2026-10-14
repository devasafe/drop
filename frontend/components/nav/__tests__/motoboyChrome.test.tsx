import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import PanelBottomNav from '../PanelBottomNav';
import AppSidebar from '../AppSidebar';

let mockPathname = '/motoboy';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, query: {}, push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 2 }) }));
jest.mock('../../../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto' }) }));
jest.mock('../../../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => true }));
jest.mock('../../../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => false }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: null, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), isOpen: () => false }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Carlos', activeRole: 'motoboy', roles: ['motoboy'] }, can: () => false }),
}));

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

beforeEach(() => { mockPathname = '/motoboy'; });

describe('chrome do painel do motoboy (D2)', () => {
  it('barra: 4 abas, sem "Mais", badge em Corridas e classe do motoboy (nunca a da loja)', () => {
    const { container } = render(<PanelBottomNav />);
    for (const l of ['Corridas', 'Ganhos', 'Nível', 'Perfil']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.queryByText('Mais')).toBeNull();
    expect(screen.getByText('Corridas').closest('button')?.textContent).toContain('2');
    const nav = container.querySelector('nav')!;
    expect(nav.className).toContain('motoboy');
    expect(nav.className).not.toContain('seller');
  });

  it('modo direto com saldo anterior: a aba continua "Ganhos" (o conteúdo é decidido na tela)', () => {
    render(<PanelBottomNav />);
    expect(screen.queryByText('Repasses recebidos')).toBeNull();
    expect(screen.queryByText('Saldo do modo anterior')).toBeNull();
  });

  it('menu lateral: os 4 itens, ativo pela rota, sem repetir a marca, classe do motoboy', () => {
    mockPathname = '/motoboy/ranking';
    const { container } = render(<AppSidebar />);
    expect(screen.getByRole('link', { name: 'Nível' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Corridas/ })).not.toHaveAttribute('aria-current');
    expect(screen.queryByText('DROP MOTOBOY')).toBeNull();
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveAttribute('aria-label', 'Painel do motoboy');
    expect(aside.className).toContain('motoboy');
  });

  it('a partir de 900px a barra some, o menu fica fixo e o conteúdo desloca (como a loja)', () => {
    expect(read('components/nav/PanelBottomNav.module.css'))
      .toMatch(/@media \(min-width: 900px\) \{\s*\.motoboy \{ display: none; \}/);
    expect(read('components/nav/AppSidebar.module.css'))
      .toMatch(/@media \(min-width: 900px\) \{\s*\.motoboy \{ transform: none; \}/);
    expect(read('styles/globals.css'))
      .toMatch(/@media \(min-width: 900px\) \{\s*\.panelContentOffsetMotoboy \{ margin-left: 256px; \}/);
  });

  it('margem única: panelContentOffset (painel) e panelContentOffsetMotoboy só ATRIBUEM margin-left 256px, sem somar', () => {
    const css = read('styles/globals.css');
    const body = (cls: string) => [...css.matchAll(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1].trim());
    // Duas regras no mesmo <main> só dão uma margem se ambas forem "margin-left: 256px" (atribuição, não padding/margin-right/calc).
    expect(body('panelContentOffset')).toEqual(['margin-left: 256px;']);
    expect(body('panelContentOffsetMotoboy')).toEqual(['margin-left: 256px;']);
  });
});
