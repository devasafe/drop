/** Caracterização de /admin/settings (Taxas e tempos): GET da config e PUT com a config inteira editada. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import AdminSettings from '../pages/admin/settings';

const mockRouter = { pathname: '/admin/settings', asPath: '/admin/settings', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const CONFIG = {
  _id: 'cfg', commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5,
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10, minOrderValue: 5,
  motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10,
  storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15, seasonalTheme: 'none',
  lateCancellationFeePercent: 20, lateCancellationMotoboyShare: 50, cardFeePercent: 2.99, cardFeeFixed: 0.39,
  cardAnticipationMonthlyRate: 1.5, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5,
};
// D3b-4a: o PUT manda só os campos editáveis (sem _id, updatedAt nem seasonalTheme)
const { _id: _omitId, updatedAt: _omitUpd, seasonalTheme: _omitTheme, ...LEAN } = { ...CONFIG } as Record<string, unknown>;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  (api.get as jest.Mock).mockImplementation((url: string) =>
    url === '/settings/platform-config' ? Promise.resolve({ data: CONFIG }) : Promise.reject(new Error(`GET inesperado: ${url}`)),
  );
});

it('lê a config e salva só os campos editáveis com a edição', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { config: { ...CONFIG, storeMinimumWithdraw: 15 }, message: 'ok' } });
  renderAdminPage(<AdminSettings />);
  await screen.findByLabelText('Saque mínimo da loja (R$)');
  expect(api.get).toHaveBeenCalledWith('/settings/platform-config');
  fireEvent.change(field('Saque mínimo da loja (R$)'), { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: /^Salvar/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(api.put).toHaveBeenCalledWith('/settings/platform-config', { ...LEAN, storeMinimumWithdraw: 15 });
  await waitFor(() => expect(field('Saque mínimo da loja (R$)').value).toBe('15'));
});

it('erro do servidor aparece na tela', async () => {
  (api.put as jest.Mock).mockRejectedValue({
    response: { status: 400, data: { error: 'O saque mínimo precisa ser um valor entre R$ 0 e R$ 100.000' } },
  });
  renderAdminPage(<AdminSettings />);
  await screen.findByLabelText('Saque mínimo da loja (R$)');
  fireEvent.change(field('Saque mínimo da loja (R$)'), { target: { value: '15' } }); // D3b-4a: 200000 agora é barrado na tela (faixa 0 a 100.000); o erro do servidor vem com valor válido
  fireEvent.click(screen.getByRole('button', { name: /^Salvar/ }));
  expect(await screen.findByText('O saque mínimo precisa ser um valor entre R$ 0 e R$ 100.000')).toBeInTheDocument();
});
