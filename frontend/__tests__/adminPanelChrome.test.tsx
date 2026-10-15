/**
 * D3a · moldura do admin no _app (spec 3.2): nas rotas /admin/* não há Nav global, AppSidebar antiga,
 * barra do painel, aviso de verificação, chat flutuante, deslocamento de 256 px nem PageTransition.
 * As páginas ainda não migradas recebem o AdminShell do _app. Loja, motoboy e cliente não mudam.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

let mockPath = '/admin/dashboard';
let mockRole = 'ceo';
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPath, asPath: mockPath, query: {}, push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { _id: 'u1', name: 'Marina', role: mockRole, activeRole: mockRole }, activeRole: mockRole, can: () => false }),
}));
jest.mock('../contexts/SocketContext', () => ({ SocketProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../contexts/CartContext', () => ({ CartProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../contexts/OverlayContext', () => ({ OverlayProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ ToastProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../contexts/SeasonalThemeContext', () => ({ SeasonalThemeProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerPanelGate', () => ({ SellerPanelGate: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/PageTransition', () => ({ __esModule: true, default: ({ children }: { children?: ReactNode }) => <div data-testid="page-transition">{children}</div> }));
jest.mock('../components/Nav', () => ({ __esModule: true, default: () => <header data-testid="nav-global" /> }));
jest.mock('../components/nav/AppSidebar', () => ({ __esModule: true, default: () => <aside data-testid="app-sidebar-antiga" /> }));
jest.mock('../components/nav/PanelBottomNav', () => ({ __esModule: true, default: () => <nav aria-label="Navegação do painel" /> }));
jest.mock('../components/VerificationBanner', () => ({ __esModule: true, default: () => <div data-testid="verification-banner" /> }));
jest.mock('../components/Footer', () => ({ __esModule: true, default: () => <footer data-testid="footer-marketing" /> }));
jest.mock('../components/SeasonalBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatWidgetWithTabs', () => ({ __esModule: true, default: () => <div data-testid="chat-fab" /> }));
jest.mock('../components/drop/CustomerAppChrome', () => ({ CustomerAppChrome: () => null }));
jest.mock('../components/drop/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../components/WalletAccessInbox', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ForceLogoutListener', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/RealtimeNotifier', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/NotificationToaster', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/CookieBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/admin/AdminShell', () => ({
  __esModule: true,
  default: ({ title, children }: { title: string; children?: ReactNode }) => <div data-testid="admin-shell" data-title={title}>{children}</div>,
}));
// A lista real de páginas não migradas encolhe a cada task de tela (P2–P5; lib/__tests__/adminLegacyShell.test.ts
// cobra a lista). Aqui só a ligação do _app, com uma rota fixa que não sai da lista.
jest.mock('../lib/adminLegacyShell', () => ({
  adminLegacyShellTitle: (p: string) => (p === '/admin/pagina-antiga' ? 'Título da tela antiga' : null),
}));
jest.mock('../hooks/useLivePresence', () => ({ useLivePresence: () => undefined }));
jest.mock('../lib/fonts', () => ({ spaceGrotesk: { variable: 'sg' }, inter: { variable: 'in' } }));
jest.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}), { virtual: true });

// eslint-disable-next-line import/first
import App from '../pages/_app';

const Page = () => <p data-testid="pagina">conteúdo</p>;
const renderApp = (path: string, role: string) => {
  mockPath = path;
  mockRole = role;
  return render(<App Component={Page} pageProps={{}} router={{} as never} />);
};
const mainDe = (c: HTMLElement) => c.querySelector('main') as HTMLElement;

describe('moldura do admin (D3a)', () => {
  it.each([
    ['/admin/dashboard', 'ceo'], ['/admin/payouts', 'ceo'], ['/admin/verificacoes', 'gerente_motoboys'], ['/admin/seasonal-theme', 'marketing'],
  ])('%s (%s): nada da moldura antiga', (path, role) => {
    const { container } = renderApp(path, role);
    expect(screen.queryByTestId('nav-global')).toBeNull();
    expect(screen.queryByTestId('app-sidebar-antiga')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Navegação do painel' })).toBeNull();
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(screen.queryByTestId('chat-fab')).toBeNull();
    expect(screen.queryByTestId('footer-marketing')).toBeNull();
    expect(mainDe(container).className).not.toContain('panelContentOffset');
    expect(screen.queryByTestId('page-transition')).toBeNull();
  });

  it('página ainda não migrada: o _app põe o AdminShell com o título da tela', () => {
    renderApp('/admin/pagina-antiga', 'ceo');
    const shell = screen.getByTestId('admin-shell');
    expect(shell).toHaveAttribute('data-title', 'Título da tela antiga');
    expect(shell).toContainElement(screen.getByTestId('pagina'));
  });

  it('rota do admin fora da lista: sem casca do _app (a página monta a dela)', () => {
    renderApp('/admin/rota-nova', 'ceo');
    expect(screen.queryByTestId('admin-shell')).toBeNull();
    expect(screen.getByTestId('pagina')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-global')).toBeNull();
  });
});

describe('os outros painéis e o cliente não mudam', () => {
  it('loja: AppSidebar, deslocamento da loja e PageTransition continuam', () => {
    const { container } = renderApp('/seller/dashboard', 'lojista');
    expect(screen.getByTestId('app-sidebar-antiga')).toBeInTheDocument();
    expect(mainDe(container).className).toContain('panelContentOffsetSeller');
    expect(screen.getByTestId('page-transition')).toContainElement(screen.getByTestId('pagina'));
    expect(screen.queryByTestId('admin-shell')).toBeNull();
  });

  it('motoboy: AppSidebar, deslocamento do motoboy e PageTransition continuam', () => {
    const { container } = renderApp('/motoboy', 'motoboy');
    expect(screen.getByTestId('app-sidebar-antiga')).toBeInTheDocument();
    expect(mainDe(container).className).toContain('panelContentOffsetMotoboy');
    expect(screen.getByTestId('page-transition')).toBeInTheDocument();
  });

  it('cliente em /notifications: Nav, aviso e chat continuam', () => {
    renderApp('/notifications', 'cliente');
    expect(screen.getAllByTestId('nav-global').length).toBeGreaterThan(0);
    expect(screen.getByTestId('verification-banner')).toBeInTheDocument();
    expect(screen.getByTestId('chat-fab')).toBeInTheDocument();
    expect(screen.getByTestId('page-transition')).toBeInTheDocument();
  });
});
