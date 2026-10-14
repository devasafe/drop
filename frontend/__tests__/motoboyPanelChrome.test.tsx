/**
 * D2 · moldura do painel do motoboy (spec 3.3; lição da conferência visual da D1, M1–M8).
 * - No celular, as telas do painel não têm a Nav global (só no computador), nem o aviso de verificação, nem o chat flutuante.
 * - A barra de 4 abas só aparece nas 4 abas e em Entregas; nas telas de fluxo, sem barra.
 * - Uma margem só: o <main> usa o deslocamento do motoboy, nunca o da loja.
 * - /dados-recebimento do motoboy recebe a mesma moldura. O perfil público só recebe quando quem vê é motoboy.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

let mockPath = '/motoboy';
let mockRole = 'motoboy';
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPath, asPath: mockPath, query: {}, push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { _id: 'u1', role: mockRole, activeRole: mockRole }, activeRole: mockRole, can: () => false }),
}));
jest.mock('../contexts/SocketContext', () => ({ SocketProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../contexts/CartContext', () => ({ CartProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../contexts/OverlayContext', () => ({ OverlayProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ ToastProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../contexts/SeasonalThemeContext', () => ({ SeasonalThemeProvider: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerPanelGate', () => ({ SellerPanelGate: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/PageTransition', () => ({ __esModule: true, default: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/Nav', () => ({ __esModule: true, default: () => <header data-testid="nav-global" /> }));
jest.mock('../components/nav/AppSidebar', () => ({ __esModule: true, default: () => null }));
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
jest.mock('../hooks/useLivePresence', () => ({ useLivePresence: () => undefined }));
jest.mock('../lib/fonts', () => ({ spaceGrotesk: { variable: 'sg' }, inter: { variable: 'in' } }));
jest.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}), { virtual: true });

// eslint-disable-next-line import/first
import App from '../pages/_app';

const Page = () => <p>conteúdo</p>;
const renderApp = (path: string, role = 'motoboy') => {
  mockPath = path;
  mockRole = role;
  return render(<App Component={Page} pageProps={{}} router={{} as never} />);
};

/** A Nav global só existe dentro do embrulho que some abaixo de 900px. */
const navSoNoDesktop = () => {
  const navs = screen.queryAllByTestId('nav-global');
  return navs.length > 0 && navs.every((n) => n.closest('.navDesktopOnly') !== null);
};
const barra = () => screen.queryByRole('navigation', { name: 'Navegação do painel' });
const mainDe = (c: HTMLElement) => c.querySelector('main') as HTMLElement;

beforeEach(() => { mockPath = '/motoboy'; mockRole = 'motoboy'; });

describe('moldura do painel do motoboy (D2)', () => {
  it('Corridas: Nav só no computador, sem aviso de verificação, sem chat flutuante, sem rodapé e com a barra', () => {
    renderApp('/motoboy');
    expect(navSoNoDesktop()).toBe(true);
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(screen.queryByTestId('chat-fab')).toBeNull();
    expect(screen.queryByTestId('footer-marketing')).toBeNull();
    expect(barra()).toBeInTheDocument();
  });

  it.each(['/motoboy', '/motoboy/entregas', '/motoboy/ganhos', '/motoboy/nivel', '/motoboy/perfil'])('%s tem a barra de abas', (path) => {
    renderApp(path);
    expect(barra()).toBeInTheDocument();
  });

  it.each([
    '/motoboy/corrida/[id]', '/motoboy/entregas/[id]', '/motoboy/ganhos/como-calculamos', '/motoboy/ranking',
    '/motoboy/notificacoes', '/motoboy/cadastro', '/motoboy/wallet',
  ])('%s (fluxo ou tela antiga): sem a barra e sem a moldura antiga', (path) => {
    renderApp(path);
    expect(barra()).toBeNull();
    expect(navSoNoDesktop()).toBe(true);
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(screen.queryByTestId('chat-fab')).toBeNull();
  });

  it('margem única: o conteúdo usa o deslocamento do motoboy, nunca o da loja', () => {
    const { container } = renderApp('/motoboy/ganhos');
    expect(mainDe(container).className).toContain('panelContentOffsetMotoboy');
    expect(mainDe(container).className).not.toContain('panelContentOffsetSeller');
  });

  it('/dados-recebimento do motoboy: a mesma moldura (sem Nav no celular, aviso, chat, rodapé e barra)', () => {
    renderApp('/dados-recebimento');
    expect(navSoNoDesktop()).toBe(true);
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(screen.queryByTestId('chat-fab')).toBeNull();
    expect(screen.queryByTestId('footer-marketing')).toBeNull();
    expect(barra()).toBeNull();
  });

  it('perfil público visto pelo cliente: segue a moldura do cliente (Nav no celular, sem deslocamento do motoboy)', () => {
    const { container } = renderApp('/motoboy/[id]', 'cliente');
    expect(screen.getAllByTestId('nav-global').some((n) => n.closest('.navDesktopOnly') === null)).toBe(true);
    expect(mainDe(container).className).not.toContain('panelContentOffsetMotoboy');
  });

  it('perfil público visto pelo motoboy ("Ver como o cliente vê"): moldura do motoboy, sem barra', () => {
    const { container } = renderApp('/motoboy/[id]');
    expect(navSoNoDesktop()).toBe(true);
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(screen.queryByTestId('chat-fab')).toBeNull();
    expect(barra()).toBeNull();
    expect(mainDe(container).className).toContain('panelContentOffsetMotoboy');
  });

  it('corrida (/motoboy/corrida/[id]): sem o chat do widget (a conversa é a sheet da corrida) e sem barra (C12)', () => {
    renderApp('/motoboy/corrida/[id]');
    expect(screen.queryByTestId('chat-fab')).toBeNull();
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(navSoNoDesktop()).toBe(true);
    expect(barra()).toBeNull();
  });

  it('a loja não ganha nada da moldura do motoboy', () => {
    const { container } = renderApp('/seller/dashboard', 'lojista');
    expect(mainDe(container).className).not.toContain('panelContentOffsetMotoboy');
  });
});
