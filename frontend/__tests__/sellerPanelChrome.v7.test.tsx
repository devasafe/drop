/**
 * V7 · moldura do painel da loja (auditoria visual D1, M1–M8).
 * - No celular, as telas do painel não têm a Nav global (só no computador), nem o aviso de verificação, nem o chat flutuante.
 * - A barra de 5 abas só aparece nas 5 abas e na Assinatura; nas secundárias, sem barra.
 * - Fora do painel, o aviso de verificação usa classe com token (sem style inline, sem emoji).
 * - As etapas do cadastro da loja não têm o rodapé de marketing.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

let mockPath = '/seller/dashboard';
let mockRole = 'lojista';
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPath, query: {}, push: jest.fn(), replace: jest.fn() }),
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
const renderApp = (path: string, role = 'lojista') => {
  mockPath = path;
  mockRole = role;
  return render(<App Component={Page} pageProps={{}} router={{} as never} />);
};

/** A Nav global só existe dentro do embrulho que some abaixo de 900px (o mesmo de produto e loja do cliente). */
const navSoNoDesktop = () => {
  const navs = screen.queryAllByTestId('nav-global');
  return navs.length > 0 && navs.every((n) => n.closest('.navDesktopOnly') !== null);
};

beforeEach(() => { mockPath = '/seller/dashboard'; mockRole = 'lojista'; });

describe('moldura do painel da loja (V7)', () => {
  it('Agora: Nav só no computador, sem aviso de verificação e sem chat flutuante', () => {
    renderApp('/seller/dashboard');
    expect(navSoNoDesktop()).toBe(true);
    expect(screen.queryByTestId('verification-banner')).toBeNull();
    expect(screen.queryByTestId('chat-fab')).toBeNull();
  });

  it('secundária (Horários): sem a barra de abas', () => {
    renderApp('/seller/horarios');
    expect(screen.queryByRole('navigation', { name: 'Navegação do painel' })).toBeNull();
    expect(navSoNoDesktop()).toBe(true);
  });

  it.each(['/seller/dashboard', '/seller/pedidos', '/seller/products', '/seller/dinheiro', '/seller/loja', '/seller/assinatura'])(
    '%s tem a barra de abas',
    (path) => {
      renderApp(path);
      expect(screen.getByRole('navigation', { name: 'Navegação do painel' })).toBeInTheDocument();
    },
  );

  it('fora do painel, o aviso e o chat continuam (motoboy)', () => {
    renderApp('/motoboy', 'motoboy');
    expect(screen.getByTestId('verification-banner')).toBeInTheDocument();
    expect(screen.getByTestId('chat-fab')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação do painel' })).toBeInTheDocument();
  });

  it.each(['/verificacao-loja', '/dados-recebimento'])('%s (cadastro da loja) sem o rodapé de marketing', (path) => {
    renderApp(path);
    expect(screen.queryByTestId('footer-marketing')).toBeNull();
  });
});

describe('SellerShell: respiro de baixo só com a barra (V7)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SellerShell = jest.requireActual('../components/seller/panel/SellerShell').default;

  it('nas abas guarda o espaço da barra; nas secundárias, não', () => {
    mockPath = '/seller/loja';
    const a = render(<SellerShell title="Loja">x</SellerShell>);
    expect((a.container.firstElementChild as HTMLElement).className).not.toContain('noBar');
    a.unmount();
    mockPath = '/seller/horarios';
    const b = render(<SellerShell title="Horários" back="/seller/loja">x</SellerShell>);
    expect((b.container.firstElementChild as HTMLElement).className).toContain('noBar');
  });
});
