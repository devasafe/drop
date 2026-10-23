import { fireEvent, screen, waitFor } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import api from '../lib/api';
import AdminSettings from '../pages/admin/settings';

const mockRouter = { pathname: '/admin/settings', asPath: '/admin/settings', push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ ...mockRouter, query: {} }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const CONFIG = {
  id: 'cfg', _id: 'cfg', settlementMode: 'custodia', updatedAt: '2026-09-22T12:00:00.000Z',
  commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5,
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10,
  motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10,
  storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15,
  lateCancellationFeePercent: 20, lateCancellationMotoboyShare: 50, cardFeePercent: 2.99, cardFeeFixed: 0.39,
  cardAnticipationMonthlyRate: 1.5, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5,
};
const KEYS = [
  'commissionPlan1', 'commissionPlan2', 'commissionPlan3', 'motoboyCutPerDelivery', 'motoboyCutPerKm',
  'motoboyCommissionPercent', 'motoboyMinimumWithdraw', 'storeMinimumWithdraw',
  'cancelFeeCustomerPercent', 'cancelFeeStorePercent', 'cancelFeeMotoboyPercent',
  'storeAcceptTimeoutMin', 'poolTimeoutMin', 'customerAbsentWaitMin',
  'lateCancellationFeePercent', 'lateCancellationMotoboyShare', 'cardFeePercent', 'cardFeeFixed',
  'cardAnticipationMonthlyRate', 'cardInstallmentMaxCount', 'cardInstallmentMinValue',
];
const GERENTE = adminAuth('gerente_geral', ['settings:manage']);
const sumRow = (label: string) => screen.getByText(label).parentElement as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) =>
    url === '/settings/platform-config' ? Promise.resolve({ data: CONFIG }) : Promise.reject(new Error(`GET inesperado: ${url}`)));
  (api.put as jest.Mock).mockResolvedValue({ data: { config: CONFIG, message: 'ok' } });
});

const LABELS = [
  'Multa por cancelamento tardio (%)', 'Parte da multa para o motoboy (%)', 'Taxa do cartão (%)',
  'Taxa fixa do cartão (R$)', 'Juros da antecipação (% ao mês)', 'Parcelas máximas', 'Valor mínimo da parcela (R$)',
];

it('seção "Cartão e cancelamento tardio" mostra os 7 inputs', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await screen.findByRole('region', { name: 'Cartão e cancelamento tardio' });
  LABELS.forEach((l) => expect(screen.getByLabelText(l)).toBeInTheDocument());
});

it('PUT enxuto: só as 21 chaves editáveis, com motivo e taxa fixa 0', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  fireEvent.change(await screen.findByLabelText('Taxa fixa do cartão (R$)'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  const [url, body] = (api.put as jest.Mock).mock.calls[0];
  expect(url).toBe('/settings/platform-config');
  expect(Object.keys(body).sort()).toEqual([...KEYS, 'changeReason'].sort());
  expect(body.cardFeeFixed).toBe(0);
  expect(body.changeReason).toBe('teste');
  ['id', '_id', 'updatedAt', 'settlementMode'].forEach((k) => expect(body).not.toHaveProperty(k));
});

it('motivo vazio: sem changeReason', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  fireEvent.change(await screen.findByLabelText('Taxa do cartão (%)'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect((api.put as jest.Mock).mock.calls[0][1]).not.toHaveProperty('changeReason');
});

it.each(['241', '0'])('prazo %s fora da faixa: aviso e salvar desabilitado', async (v) => {
  renderAdminPage(<AdminSettings />, GERENTE);
  fireEvent.change(await screen.findByLabelText('Prazo para achar motoboy (min)'), { target: { value: v } });
  expect(screen.getByText('Use um valor de 1 a 240')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salvar 1 mudança' })).toBeDisabled();
});

it('parcelas 2.5: pede inteiro e desabilita o salvar', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  fireEvent.change(await screen.findByLabelText('Parcelas máximas'), { target: { value: '2.5' } });
  expect(screen.getByText('Use um número inteiro')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salvar 1 mudança' })).toBeDisabled();
});

it('simulação com taxa fixa 0 e km 0: motoboy recebe R$ 0,00', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  fireEvent.change(await screen.findByLabelText('Taxa fixa por entrega (R$)'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Por km de rota (R$)'), { target: { value: '0' } });
  expect(sumRow('Motoboy (80% de R$ 0,00)')).toHaveTextContent('R$ 0,00');
});
