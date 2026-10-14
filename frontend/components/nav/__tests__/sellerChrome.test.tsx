import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import PanelBottomNav from '../PanelBottomNav';
import AppSidebar from '../AppSidebar';

let mockRole = 'lojista';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/seller/dashboard', query: {}, push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 0 }) }));
jest.mock('../../../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia' }) }));
jest.mock('../../../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../../../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => false }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: null, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), isOpen: () => false }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'X', activeRole: mockRole, roles: [mockRole] }, can: () => false }),
}));

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const clientBreakpoint = Number(/@media \(min-width: (\d+)px\)/.exec(read('components/drop/CustomerAppChrome.module.css'))![1]);

beforeEach(() => { mockRole = 'lojista'; });

describe('chrome do painel da loja no breakpoint do cliente', () => {
  it('o breakpoint do cliente é 900px', () => {
    expect(clientBreakpoint).toBe(900);
  });

  it('a barra de 5 abas some no computador no mesmo ponto do cliente', () => {
    expect(read('components/nav/PanelBottomNav.module.css'))
      .toMatch(new RegExp(`@media \\(min-width: ${clientBreakpoint}px\\) \\{\\s*\\.seller \\{ display: none; \\}`));
  });

  it('o menu lateral fica fixo a partir do mesmo ponto', () => {
    expect(read('components/nav/AppSidebar.module.css'))
      .toMatch(new RegExp(`@media \\(min-width: ${clientBreakpoint}px\\) \\{\\s*\\.seller \\{ transform: none; \\}`));
    expect(read('styles/globals.css'))
      .toMatch(new RegExp(`@media \\(min-width: ${clientBreakpoint}px\\) \\{\\s*\\.panelContentOffsetSeller \\{ margin-left: 256px; \\}`));
  });

  it('só o lojista ganha a classe da loja; o motoboy ganha a dele (D2)', () => {
    const a = render(<PanelBottomNav />);
    expect(a.container.querySelector('nav')!.className).toContain('seller');
    const b = render(<AppSidebar />);
    expect(b.container.querySelector('aside')!.className).toContain('seller');
    a.unmount(); b.unmount();

    mockRole = 'motoboy';
    const c = render(<PanelBottomNav />);
    expect(c.container.querySelector('nav')!.className).not.toContain('seller');
    expect(c.container.querySelector('nav')!.className).toContain('motoboy');
    const d = render(<AppSidebar />);
    expect(d.container.querySelector('aside')!.className).not.toContain('seller');
    expect(d.container.querySelector('aside')!.className).toContain('motoboy');
  });
});
