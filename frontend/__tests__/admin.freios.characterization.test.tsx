/** Caracterização de /admin/freios: GET /admin/switches e PUT { [chave]: !atual } por freio. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { adminAuth, renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import FreiosPage from '../pages/admin/freios';

const mockRouter = { pathname: '/admin/freios', asPath: '/admin/freios', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const SW = {
  rankingPrizesEnabled: false, benefitsRedeemEnabled: true, gamificationPointsEnabled: false,
  settlementMode: 'custodia', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5, directTransfersEnabled: false,
};

/** Nova: a confirmação abre no cartão. Antiga: envia no primeiro clique. */
function confirmOnCard() {
  const btn = screen.queryByRole('button', { name: 'Confirmar' });
  if (btn) fireEvent.click(btn);
}

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  (api.get as jest.Mock).mockResolvedValue({ data: SW });
  (api.put as jest.Mock).mockImplementation((_url: string, body: Record<string, unknown>) => Promise.resolve({ data: { ...SW, ...body } }));
});

it('lê os freios uma vez', async () => {
  renderAdminPage(<FreiosPage />, adminAuth('gerente_geral', ['settings:manage']));
  await screen.findAllByRole('button', { name: 'Ativar' });
  expect(api.get).toHaveBeenCalledWith('/admin/switches');
  expect((api.get as jest.Mock).mock.calls.filter(([u]) => u === '/admin/switches')).toHaveLength(1);
});

it('ativar o primeiro freio: PUT /admin/switches { rankingPrizesEnabled: true }', async () => {
  renderAdminPage(<FreiosPage />, adminAuth('gerente_geral', ['settings:manage']));
  // a antiga desenha os botões desabilitados antes de ler; esperar habilitar
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ativar' })[0]).toBeEnabled());
  fireEvent.click(screen.getAllByRole('button', { name: 'Ativar' })[0]);
  confirmOnCard();
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/switches', { rankingPrizesEnabled: true }));
  expect(api.put).toHaveBeenCalledTimes(1);
});

it('pausar o que está ativo: PUT { benefitsRedeemEnabled: false }', async () => {
  renderAdminPage(<FreiosPage />, adminAuth('gerente_geral', ['settings:manage']));
  fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }));
  confirmOnCard();
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/switches', { benefitsRedeemEnabled: false }));
});
