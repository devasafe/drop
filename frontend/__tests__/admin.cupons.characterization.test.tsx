/** Caracterização de /admin/coupons: GET com params, POST do cupom global e PUT …/toggle. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import AdminCoupons from '../pages/admin/coupons';

const mockRouter = { pathname: '/admin/coupons', asPath: '/admin/coupons', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const COUPONS = [{
  _id: 'c1', code: 'SEMANATECH', type: 'global', discountType: 'percent', discountValue: 15, minOrderValue: 100,
  maxUses: 500, usedCount: 214, validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2026-10-12T00:00:00.000Z', isActive: true,
}];
const today = () => new Date().toISOString().slice(0, 10);
const nextMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); };

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  (api.get as jest.Mock).mockResolvedValue({ data: COUPONS });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
  (api.put as jest.Mock).mockResolvedValue({ data: {} });
});

it('lê com params vazios e filtra por tipo', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByText('SEMANATECH');
  expect(api.get).toHaveBeenCalledWith('/coupons', { params: {} });
  fireEvent.click(screen.getByRole('button', { name: 'Globais' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/coupons', { params: { type: 'global' } }));
});

it('cria cupom global: POST /coupons com o mesmo corpo e relê', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByText('SEMANATECH');
  const open = screen.queryByRole('button', { name: '+ Novo Cupom' });
  if (open) fireEvent.click(open);
  fireEvent.change(screen.getByPlaceholderText('EX: DROPDESCONTO20'), { target: { value: 'black10' } });
  fireEvent.change(screen.getByPlaceholderText('Sem mínimo'), { target: { value: '50' } });
  fireEvent.change(screen.getByPlaceholderText('Ilimitado'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: /^Criar cupom$/i }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/coupons', {
    code: 'BLACK10', type: 'global', discountType: 'percent', discountValue: 10,
    minOrderValue: 50, maxUses: 100, validFrom: today(), validUntil: nextMonth(),
  }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});

it('pausar: PUT /coupons/:id/toggle e relê', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByText('SEMANATECH');
  fireEvent.click(screen.getAllByRole('button', { name: /^(Desativar|Pausar)/ })[0]);
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/coupons/c1/toggle'));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
