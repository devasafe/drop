/**
 * Avisos da home (22/10, segurança): o servidor já recusa link perigoso, mas um banner gravado antes pode ter
 * `javascript:` ou `//host`. A home confere o link antes do href (lib/safeLink.ts, a mesma regra do servidor).
 */
import { render, screen } from '@testing-library/react';
import Inicio from '../pages/inicio';
import api from '../lib/api';
import { safeBannerHref } from '../lib/safeLink';

let mockBanners: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
  useFeaturedStores: () => ({ stores: [], loading: false }),
  usePromoBanners: () => ({ banners: mockBanners, loading: false }),
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false }),
}));
jest.mock('../hooks/useActiveOrders', () => ({ useActiveOrders: () => ({ activeOrders: [], orders: [], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  (api.get as jest.Mock).mockResolvedValue({ data: {} });
  (api.post as jest.Mock).mockResolvedValue({ data: { data: [] } });
});

describe('safeBannerHref', () => {
  it.each([
    'javascript:alert(1)', ' JavaScript:alert(1)', 'java script:alert(1)', 'data:text/html,x', 'vbscript:x',
    '//evil.com', ' //evil.com', '/\\evil.com', 'HTTPS ://evil.com', 'ftp://x.com', 'evil.com',
    `https://x.com/${'a'.repeat(2048)}`, '', null, undefined, 42,
  ])('%p não vira href', (raw) => {
    expect(safeBannerHref(raw)).toBeUndefined();
  });

  it.each([
    ['https://drop.app/promo', 'https://drop.app/promo'],
    ['  HTTPS://drop.app/x  ', 'HTTPS://drop.app/x'],
    ['http://drop.app', 'http://drop.app'],
    ['/loja/abc', '/loja/abc'],
  ])('%p vira href', (raw, href) => {
    expect(safeBannerHref(raw)).toBe(href);
  });
});

describe('banner da home', () => {
  it('link inválido gravado não vira href; o aviso aparece sem link', () => {
    mockBanners = [
      { _id: 'b1', title: 'Ruim', imageUrl: 'https://res.cloudinary.com/x/a.jpg', linkUrl: 'javascript:alert(1)' },
      { _id: 'b2', title: 'Bom', imageUrl: 'https://res.cloudinary.com/x/b.jpg', linkUrl: '/loja/abc' },
    ];
    const { container } = render(<Inicio />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /javascript/i.test(h))).toBe(false);
    expect(screen.getByRole('link', { name: 'Bom' })).toHaveAttribute('href', '/loja/abc');
    expect(screen.queryByRole('link', { name: 'Ruim' })).toBeNull();
  });
});
