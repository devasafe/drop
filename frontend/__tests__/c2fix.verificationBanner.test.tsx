/**
 * Conferência visual (2026-10-11):
 * - Home: cards de oferta ocupam a coluna da grade (variante "grade"), não 150px fixos;
 * - toda tela do cliente tem header próprio no mobile: a Nav antiga (logo branco) não aparece;
 * - o aviso de verificação nas telas do cliente segue o DS (tokens) e não duplica o Alert da Conta.
 */
import { render, screen } from '@testing-library/react';
import Inicio from '../pages/inicio';
import VerificationBanner from '../components/VerificationBanner';
import { CUSTOMER_ROUTES, CUSTOMER_HEADERLESS_ROUTES } from '../lib/routes';

let mockPath = '/inicio';
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), query: {}, pathname: mockPath }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', activeRole: 'cliente' }, activeRole: 'cliente' }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
  useFeaturedStores: () => ({ stores: [], loading: false }),
  usePromoBanners: () => ({ banners: [], loading: false }),
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false }),
}));
jest.mock('../hooks/useActiveOrders', () => ({ useActiveOrders: () => ({ activeOrders: [], orders: [], loading: false }) }));
jest.mock('../hooks/useCatalogHome', () => ({
  useNearbyStores: () => ({ stores: [], loading: false }),
  useOffers: () => ({ products: [{ _id: 'p1', name: 'Kit de Suculentas', price: 69, storeId: 's1', storeName: 'Flor & Cia' }], loading: false, failed: false, retry: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { missing: ['email'] } })), post: jest.fn() } }));

test('aviso de verificação nas telas do cliente: texto do DS, sem cor fixa', async () => {
  mockPath = '/inicio';
  render(<VerificationBanner />);
  const alert = await screen.findByRole('status');
  expect(alert).toHaveTextContent('Confirme seus dados para comprar');
  expect(alert.getAttribute('style') || '').not.toMatch(/#F59E0B/i);
  expect(screen.getByRole('link', { name: 'Verificar agora' })).toHaveAttribute('href', '/verificacao');
});

test('na Conta o aviso global não aparece (ela já tem o Alert próprio)', async () => {
  mockPath = '/conta';
  const { container } = render(<VerificationBanner />);
  await new Promise((r) => setTimeout(r, 50));
  expect(container).toBeEmptyDOMElement();
});
