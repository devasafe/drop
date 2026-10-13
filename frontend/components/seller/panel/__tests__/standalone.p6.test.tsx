// frontend/components/seller/panel/__tests__/standalone.p6.test.tsx
/**
 * Task 58 (P6.1): pré-condição que `SellerShell` e `useSellerPanel` funcionam
 * fora do provider, como exigem testes intocáveis (seller-order-refund,
 * b5.sellerCatalogOwnerRoute, legacyBalanceCard).
 */

import { render, screen, renderHook } from '@testing-library/react';
import SellerShell from '../SellerShell';
import { useSellerPanel } from '../SellerPanelProvider';

// Ambiente que imita seller-order-refund e os testes intocáveis:
// sem SellerPanelProvider, router.pathname undefined, api.get devolvendo undefined.
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    query: {},
    asPath: '/seller/order-o1',
  }),
}));

jest.mock('../../../../contexts/AuthContext', () => ({
  __esModule: true,
  default: {
    Provider: ({ value, children }: any) => <div>{children}</div>,
    Consumer: ({ children }: any) => children({} as any),
  },
  useAuth: () => ({
    user: { _id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' },
    can: () => true,
    loading: false,
    permissionsLoading: false,
  }),
}));

jest.mock('../../../../contexts/SocketContext', () => ({
  useSocket: () => ({
    on: () => () => undefined,
    emit: jest.fn(),
    isConnected: false,
  }),
}));

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://x/api' },
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Task 58 (P6.1): SellerShell e useSellerPanel fora do provider', () => {
  test('SellerShell renderiza fora do SellerPanelProvider, sem pathname e sem API', () => {
    render(
      <SellerShell title="Pedido #ABC123" back="/seller/pedidos">
        <p>conteúdo</p>
      </SellerShell>,
    );
    expect(screen.getByText('Pedido #ABC123')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  test('useSellerPanel fora do provider devolve o padrão vazio, sem lançar', () => {
    const { result } = renderHook(() => useSellerPanel());
    expect(result.current.store).toBeNull();
    expect(result.current.orders).toEqual([]);
    expect(result.current.history).toEqual([]);
    expect(result.current.newOrderCount).toBe(0);
    expect(typeof result.current.refresh).toBe('function');
    expect(typeof result.current.patchOrder).toBe('function');
    expect(typeof result.current.removeOrder).toBe('function');
  });
});
