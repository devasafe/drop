// frontend/__tests__/seller-plano.test.tsx
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerPlano, { received, prevMonthRange } from '../pages/seller/plano';
import api from '../lib/api';

const mockRefresh = jest.fn();
let mockPanel: any;
let mockSub: any;
let mockSaas: any;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/plano' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  mockPanel = { store: { _id: 's1', plan: 2, customCommissionRate: null, featuredBannerUrl: null }, orders: [], refresh: mockRefresh, newOrderCount: 0 };
  mockSub = { currentPlan: 'plan2', requestedPlan: null, planChangeStatus: 'none' };
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-subscription') return Promise.resolve({ data: mockSub });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5 } });
    if (url === '/analytics/store/overview') return Promise.resolve({ data: { current: { revenue: 1000, orders: 10, productsSold: 10, avgTicket: 100, cancellationRate: 0 } } });
    return Promise.resolve({ data: {} });
  });
});

const renderPage = () => render(<ToastProvider><SellerPlano /></ToastProvider>);

test('plano atual com a comissão do admin e simulação com as vendas do mês anterior', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Pool de motoboys · Plano 2' })).toBeInTheDocument();
  expect(screen.getByText('15%')).toBeInTheDocument();
  expect(screen.getByText('padrão do plano')).toBeInTheDocument();
  expect(await screen.findByText(/R\$ 900,00/)).toBeInTheDocument();
  expect(screen.getByText(/R\$ 950,00/)).toBeInTheDocument();
  expect(screen.getAllByText(/R\$ 850,00/).length).toBeGreaterThan(0);
  expect(api.get).toHaveBeenCalledWith('/analytics/store/overview', { params: { from: expect.any(String), to: expect.any(String) } });
  expect(document.body.textContent).not.toMatch(/mensalidade|renova/i);
});

test('valores calculados aparecem como estimativa, nunca como recebido', async () => {
  renderPage();
  expect(await screen.findByText(/você receberia cerca de R\$ 850,00 \(estimativa\)/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/você recebeu|teria recebido/i);
});

test('falha no overview mostra erro com tentar de novo, não "sem vendas"', async () => {
  const base = (api.get as jest.Mock).getMockImplementation()!;
  (api.get as jest.Mock).mockImplementation((url: string) => (url === '/analytics/store/overview' ? Promise.reject(new Error('x')) : base(url)));
  renderPage();
  expect(await screen.findByText('Não carregamos as suas vendas')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/sem vendas no mês/);
  (api.get as jest.Mock).mockImplementation(base);
  fireEvent.click(screen.getByText('Tentar de novo'));
  await waitFor(() => expect(screen.queryByText('Não carregamos as suas vendas')).not.toBeInTheDocument());
});

test('erro ao ler o modo não mostra plano nem comissão; carregando mostra skeleton', async () => {
  mockSaas = { settlementMode: 'custodia', loading: false, error: true, retry: jest.fn() };
  const { unmount } = renderPage();
  expect(await screen.findByText('Não carregamos o seu plano')).toBeInTheDocument();
  expect(screen.queryByText('15%')).not.toBeInTheDocument();
  unmount();
  mockSaas = { settlementMode: 'custodia', loading: true, error: false };
  renderPage();
  await act(async () => {});
  expect(screen.queryByText('Sua comissão')).not.toBeInTheDocument();
  expect(screen.queryByText('Não carregamos o seu plano')).not.toBeInTheDocument();
});

test('comissão personalizada aparece como condição especial', async () => {
  mockPanel = { ...mockPanel, store: { ...mockPanel.store, customCommissionRate: 8 } };
  renderPage();
  expect(await screen.findByText('condição especial')).toBeInTheDocument();
  expect(screen.getByText('8%')).toBeInTheDocument();
});

test('pedir troca confirma num sheet e envia o plano novo', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { subscription: { currentPlan: 'plan2', requestedPlan: 'plan3', planChangeStatus: 'pending', requestedAt: '2026-10-07T12:00:00Z' } } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Trocar para Premium' }));
  expect(screen.getByText('Trocar para Premium?')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Pedir troca'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/settings/store-subscription/request-change', { newPlan: 'plan3' }));
  expect(await screen.findByText('Troca para Premium em análise')).toBeInTheDocument();
});

test('troca em análise: cancelar chama o DELETE e o aviso some', async () => {
  mockSub = { currentPlan: 'plan2', requestedPlan: 'plan3', planChangeStatus: 'pending', requestedAt: '2026-10-07T12:00:00Z' };
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true, data: { currentPlan: 'plan2', requestedPlan: null, planChangeStatus: 'none' } } });
  renderPage();
  expect(await screen.findByText('Troca para Premium em análise')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Trocar para Vitrine' })).toBeDisabled();
  fireEvent.click(screen.getByText('Cancelar pedido de troca'));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/settings/store-subscription/request-change'));
  await waitFor(() => expect(screen.queryByText('Troca para Premium em análise')).not.toBeInTheDocument());
});

test('troca recusada mostra o motivo', async () => {
  mockSub = { currentPlan: 'plan2', requestedPlan: 'plan3', planChangeStatus: 'rejected', rejectionReason: 'CNPJ em análise' };
  renderPage();
  expect(await screen.findByText('Troca de plano recusada')).toBeInTheDocument();
  expect(screen.getByText('CNPJ em análise')).toBeInTheDocument();
});

test('banner do Início pode ser enviado antes da aprovação (type=featured)', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, type: 'featured', url: 'https://x/b.png' } });
  renderPage();
  await screen.findByRole('heading', { name: 'Pool de motoboys · Plano 2' });
  expect(screen.getByText('Pode enviar agora: ele entra no ar quando o Premium for aprovado.')).toBeInTheDocument();
  const file = new File(['x'], 'banner.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Escolher o banner do Início'), { target: { files: [file] } });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/banner?type=featured', expect.any(FormData)));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
});

test('received e prevMonthRange', () => {
  expect(received(1000, 15)).toBe(850);
  expect(received(19.99, 10)).toBe(17.99);
  expect(prevMonthRange(new Date(2026, 9, 12))).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'setembro' });
  expect(prevMonthRange(new Date(2026, 0, 5))).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
});
