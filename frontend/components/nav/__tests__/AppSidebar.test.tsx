import { render, screen } from '@testing-library/react';
import AppSidebar from '../AppSidebar';

let mockPathname = '/motoboy/ganhos';
let mockQuery: Record<string, string> = {};
let mockRole = 'motoboy';
let mockRoles = ['motoboy'];

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, query: mockQuery, push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 3 }) }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: null, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), isOpen: () => false }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  // can() reflete o papel: os papéis do admin têm tudo; motoboy e lojista, nada.
  useAuth: () => ({
    user: { name: 'X', activeRole: mockRole, roles: mockRoles },
    can: () =>
      ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(
        mockRole,
      ),
  }),
}));

beforeEach(() => {
  mockPathname = '/motoboy/ganhos';
  mockQuery = {};
  mockRole = 'motoboy';
  mockRoles = ['motoboy'];
});

describe('AppSidebar (motoboy)', () => {
  it('renderiza as 4 abas no menu lateral e marca o ativo por rota', () => {
    render(<AppSidebar />);
    expect(screen.getByText('Corridas')).toBeInTheDocument();
    expect(screen.getByText('Ganhos').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Corridas').closest('a')?.getAttribute('aria-current')).toBeNull();
  });

  it('mostra o badge de deliveries em Corridas', () => {
    render(<AppSidebar />);
    expect(screen.getByText('Corridas').closest('a')?.textContent).toContain('3');
  });
});

describe('AppSidebar (lojista)', () => {
  it('lojista: aba ativa pela rota (/seller/pedidos, mesmo com o ?tab= do redirect)', () => {
    mockRole = 'lojista'; mockRoles = ['lojista'];
    mockPathname = '/seller/pedidos'; mockQuery = { seg: 'andamento', tab: 'orders' };
    render(<AppSidebar />);
    expect(screen.getByText('Pedidos').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Agora').closest('a')?.getAttribute('aria-current')).toBeNull();
  });

  it('lojista: subitem da Loja acende junto com a aba Loja', () => {
    mockRole = 'lojista'; mockRoles = ['lojista'];
    mockPathname = '/seller/analytics'; mockQuery = {};
    render(<AppSidebar />);
    expect(screen.getByText('Desempenho').closest('a')?.getAttribute('aria-current')).toBe('page');
    // "Loja" aparece duas vezes: rótulo do grupo (div) e a aba (a).
    const lojaTab = screen.getAllByText('Loja')
      .map((el) => el.closest('a'))
      .find((el): el is HTMLAnchorElement => el !== null);
    expect(lojaTab?.getAttribute('aria-current')).toBe('page');
  });
});

describe('AppSidebar (admin)', () => {
  it.each(['ceo', 'marketing', 'gerente_geral'])('%s: não monta (o admin usa o AdminSidebar do AdminShell)', (role) => {
    mockRole = role; mockRoles = [role];
    mockPathname = '/admin/dashboard'; mockQuery = {};
    const { container } = render(<AppSidebar />);
    expect(container).toBeEmptyDOMElement();
  });
});
