// frontend/__tests__/seller-analytics.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerAnalytics, { deltaLabel, hourly } from '../pages/seller/analytics';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/analytics' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: [{ _id: 'p1', quantity: 2 }], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const OV = {
  period: { days: 30, start: '', end: '' },
  current: { revenue: 24310, orders: 268, productsSold: 300, avgTicket: 90.7, cancellationRate: 2.1 },
  previous: { revenue: 20600, orders: 246, productsSold: 280, avgTicket: 93.5, cancellationRate: 3 },
  delta: { revenue: 18, orders: 9, productsSold: 7, avgTicket: -3, cancellationRate: -0.9 },
  platformCancellationRate: 4.8,
};
let payFails = 0;
function mockApi(ov: any = OV) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/analytics/store/overview') return Promise.resolve({ data: ov });
    if (url === '/analytics/store/peak-hours') return Promise.resolve({ data: { matrix: [{ dayOfWeek: 2, hour: 18, count: 5, revenue: 0 }, { dayOfWeek: 3, hour: 19, count: 8, revenue: 0 }, { dayOfWeek: 3, hour: 12, count: 2, revenue: 0 }] } });
    if (url === '/analytics/store/top-products') return Promise.resolve({ data: { products: [{ _id: 'p1', name: 'Fone JBL', quantity: 31, revenue: 7126 }] } });
    if (url === '/analytics/store/payment-methods') {
      if (payFails > 0) { payFails -= 1; return Promise.reject(new Error('rede')); }
      return Promise.resolve({ data: { methods: [{ method: 'pix', count: 10, revenue: 0, percent: 71 }] } });
    }
    return Promise.resolve({ data: {} });
  });
}
const overviewCalls = () => (api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/analytics/store/overview');

beforeEach(() => { jest.clearAllMocks(); payFails = 0; mockApi(); });

test('KPIs usam o delta do servidor numa chamada só e comparam o cancelamento com o DROP', async () => {
  render(<SellerAnalytics />);
  expect(await screen.findByText('R$ 24.310,00')).toBeInTheDocument();
  expect(screen.getByText('↑ 18% vs. período anterior')).toBeInTheDocument();
  expect(screen.getByText('↓ 3% vs. período anterior')).toBeInTheDocument();
  expect(screen.getByText('2,1%')).toBeInTheDocument();
  expect(screen.getByText('média DROP 4,8%')).toBeInTheDocument();
  expect(overviewCalls()).toHaveLength(1);
});

test('pico por hora, mais vendidos com estoque e como pagam', async () => {
  render(<SellerAnalytics />);
  expect(await screen.findByText(/Pico às 19h–20h/)).toBeInTheDocument();
  expect(await screen.findByText('31 vendas · R$ 7.126,00')).toBeInTheDocument();
  expect(screen.getByText('2 em estoque')).toBeInTheDocument();
  expect(await screen.findByText('Pix')).toBeInTheDocument();
  expect(screen.getByText('71%')).toBeInTheDocument();
});

test('trocar o período pede de novo com o preset', async () => {
  render(<SellerAnalytics />);
  await screen.findByText('R$ 24.310,00');
  fireEvent.click(screen.getByText('7 dias'));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/analytics/store/overview', { params: { period: '7d' } }));
});

test('bloco com erro: só ele mostra "Tentar de novo" e recarrega', async () => {
  payFails = 1;
  render(<SellerAnalytics />);
  expect(await screen.findByText('R$ 24.310,00')).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Tentar de novo'));
  expect(await screen.findByText('Pix')).toBeInTheDocument();
});

test('loja sem vendas: estado vazio com dica', async () => {
  mockApi({ ...OV, current: { ...OV.current, orders: 0, revenue: 0 }, previous: { ...OV.previous, orders: 0 } });
  render(<SellerAnalytics />);
  expect(await screen.findByText('Seus números aparecem depois das primeiras vendas')).toBeInTheDocument();
});

test('deltaLabel e hourly', () => {
  expect(deltaLabel(0)).toEqual({ text: 'igual ao período anterior', tone: 'neutral' });
  expect(deltaLabel(-12.4)).toEqual({ text: '↓ 12% vs. período anterior', tone: 'err' });
  const h = hourly([{ dayOfWeek: 1, hour: 9, count: 2, revenue: 0 }, { dayOfWeek: 2, hour: 9, count: 3, revenue: 0 }]);
  expect(h).toHaveLength(24);
  expect(h[9]).toBe(5);
});
