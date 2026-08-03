import { render, screen, fireEvent } from '@testing-library/react';
import Inicio from '../pages/inicio';

const push = jest.fn();
const add = jest.fn();
const stores = [{ _id: 'g1', name: 'Loja Geral', plan: 1 }];
const topStores = [
  { _id: 't1', name: 'Loja Comum', plan: 1 },
  { _id: 't2', name: 'Premium Top', plan: 3 },
];
const featuredStores = [
  { _id: 'f1', name: 'Banner Premium', plan: 3, featuredBannerUrl: 'b.jpg' },
  { _id: 'f2', name: 'Banner Premium 2', plan: 3, featuredBannerUrl: 'b2.jpg' },
];

const mockUseAuth = jest.fn(() => ({ user: null as any }));
const mockUseActiveOrders = jest.fn(() => ({ activeOrders: [] as any[], orders: [] as any[], loading: false }));

jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ add }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false }),
  useStores: () => ({ stores, loading: false }),
  useTopStores: () => ({ stores: topStores, loading: false }),
  useFeaturedStores: () => ({ stores: featuredStores, loading: false }),
  usePromoBanners: () => ({ banners: [], loading: false }),
  useProducts: () => ({ products: [], loading: false }),
}));
jest.mock('../hooks/useActiveOrders', () => ({ useActiveOrders: () => mockUseActiveOrders() }));

beforeEach(() => {
  push.mockClear();
  add.mockClear();
  mockUseAuth.mockReturnValue({ user: null });
  mockUseActiveOrders.mockReturnValue({ activeOrders: [], orders: [], loading: false });
});

describe('/inicio', () => {
  it('mostra o banner premium no carrossel', () => {
    render(<Inicio />);
    expect(screen.getByText('Banner Premium')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: /lojas em destaque/i })).toBeInTheDocument();
  });

  it('lista só lojas premium (Plano 3) — loja comum não aparece', () => {
    render(<Inicio />);
    expect(screen.getByText('Premium Top')).toBeInTheDocument();
    expect(screen.queryByText('Loja Comum')).toBeNull();
  });

  it('Ver mais leva para /stores', () => {
    render(<Inicio />);
    fireEvent.click(screen.getByText('Ver mais'));
    expect(push).toHaveBeenCalledWith('/stores');
  });

  it('não mostra o card de pedido ativo quando não há pedidos ativos', () => {
    render(<Inicio />);
    expect(screen.queryByRole('button', { name: /Pedido #/i })).toBeNull();
  });

  it('mostra o card de pedido ativo e navega para /store-order/:id ao clicar', () => {
    mockUseAuth.mockReturnValue({ user: { _id: 'u1' } });
    mockUseActiveOrders.mockReturnValue({
      activeOrders: [
        { _id: 'order123', status: 'enviado', storeName: 'Loja X', products: [] },
      ],
      orders: [
        { _id: 'order123', status: 'enviado', storeName: 'Loja X', products: [] },
      ],
      loading: false,
    });

    render(<Inicio />);

    const card = screen.getByRole('button', { name: /Pedido #DER123/i });
    expect(card).toBeInTheDocument();
    expect(screen.getByText(/Loja X/)).toBeInTheDocument();

    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith('/store-order/order123');
  });
});
