import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: {}, asPath: '/seller/dinheiro', pathname: '/seller/dinheiro' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => ({ store: { _id: 's1' } }) }));
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => ({ hasLeftover: false, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

import { __resetSaasConfigCache } from '../hooks/useSaasConfig';
import SellerDinheiroPage from '../pages/seller/dinheiro';

const get = api.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetSaasConfigCache();
});

test('se /settings/saas falha, mostra erro, sem "Sacar" nem custódia; "Tentar de novo" refaz a leitura', async () => {
  get.mockImplementation((url: string) => {
    if (url === '/settings/saas') return Promise.reject(new Error('x'));
    return Promise.reject(new Error('n/a'));
  });
  const { container } = render(<SellerDinheiroPage />);
  expect(await screen.findByText('Não carregamos o seu Dinheiro')).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/Sacar|Liberado|Disponível para sacar/);
  expect(get.mock.calls.some(([u]) => String(u).startsWith('/wallets/store') || String(u).startsWith('/payouts/my') || String(u).startsWith('/withdrawals'))).toBe(false);

  get.mockImplementation((url: string) => {
    if (url === '/settings/saas') return Promise.resolve({ data: { settlementMode: 'direto', directCardEnabled: false } });
    return Promise.reject(new Error('n/a'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(screen.queryByText('Não carregamos o seu Dinheiro')).not.toBeInTheDocument());
  expect(get.mock.calls.filter(([u]) => u === '/settings/saas').length).toBe(2);
  expect(get.mock.calls.some(([u]) => String(u).startsWith('/wallets/store'))).toBe(false);
});
