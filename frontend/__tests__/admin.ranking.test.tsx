import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
import api from '../lib/api';
import AdminSettings from '../pages/admin/settings';

let mockQuery: Record<string, string> = {};
const mockRouter = { pathname: '/admin/settings', asPath: '/admin/settings', push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ ...mockRouter, query: mockQuery }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const PRIZES = [
  { position: 1, amount: 500, type: 'wallet' },
  { position: 2, amount: 300, type: 'wallet' },
  { position: 3, amount: 150, type: 'manual' },
];
const CURRENT = { month: 10, year: 2026, prizes: PRIZES, distributed: false };
const HISTORY = [{ month: 9, year: 2026, prizes: PRIZES, distributedAt: '2026-10-01T12:00:00.000Z', distributedBy: { name: 'Asafe' } }];
const CONFIG = { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5, motoboyCutPerDelivery: 5, motoboyCutPerKm: 1,
  motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10, motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10,
  cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15 };
const RANKING_ONLY = adminAuth('gerente_motoboys', ['ranking:manage']);

let current: unknown = CURRENT;
let statusFails = false;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockQuery = {};
  current = CURRENT;
  statusFails = false;
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/ranking-prizes') return Promise.resolve({ data: current });
    if (url === '/ranking-prizes/history') return Promise.resolve({ data: HISTORY });
    if (url === '/ranking-prizes/config-status') {
      return statusFails ? Promise.reject({ response: { status: 500 } }) : Promise.resolve({ data: { rankingPrizesEnabled: false } });
    }
    if (url === '/settings/platform-config') return Promise.resolve({ data: CONFIG });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  (api.put as jest.Mock).mockResolvedValue({ data: { rankingPrizesEnabled: true } });
  (api.post as jest.Mock).mockResolvedValue({ data: { results: [{ credited: true }, { credited: true }] } });
});

describe('abas por permissão (D1)', () => {
  it('só ranking:manage: abre /admin/settings direto no Ranking e não lê as taxas', async () => {
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    expect(screen.getByRole('heading', { name: 'Regras e taxas · Ranking' })).toBeInTheDocument();
    await screen.findByLabelText('Valor do 1º lugar (R$)');
    expect(api.get).not.toHaveBeenCalledWith('/settings/platform-config');
  });

  it('só settings:manage em ?aba=ranking: fica em Taxas e tempos e não lê o ranking', async () => {
    mockQuery = { aba: 'ranking' };
    renderAdminPage(<AdminSettings />, adminAuth('gerente_geral', ['settings:manage']));
    await screen.findByLabelText('Plano 2 · com motoboys (%)');
    expect(api.get).not.toHaveBeenCalledWith('/ranking-prizes');
  });

  it('sem nenhuma das duas: sai da tela e nada é lido', async () => {
    renderAdminPage(<AdminSettings />, adminAuth('marketing', ['theme:edit']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('aba Ranking', () => {
  beforeEach(() => { mockQuery = { aba: 'ranking' }; });

  it('prêmios do mês, situação, histórico', async () => {
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
    expect(screen.getByText('Pausados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar prêmios' })).toBeEnabled();
    expect((screen.getByLabelText('Valor do 1º lugar (R$)') as HTMLInputElement).value).toBe('500');
    expect((screen.getByLabelText('Tipo do 3º lugar') as HTMLSelectElement).value).toBe('manual');
    const history = screen.getByRole('region', { name: 'Distribuições anteriores' });
    expect(within(history).getByText('setembro de 2026')).toBeInTheDocument();
    expect(within(history).getByText(/por Asafe/)).toBeInTheDocument();
  });

  it('situação ilegível: "desconhecida" e liga/desliga travado (nunca presume pausado)', async () => {
    statusFails = true;
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    expect(await screen.findByText('Situação desconhecida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar prêmios' })).toBeDisabled();
  });

  it('prêmios ilegíveis: erro com "Tentar de novo"', async () => {
    (api.get as jest.Mock).mockImplementationOnce(() => Promise.reject({ response: { status: 500, data: { error: 'Erro ao buscar prêmios' } } }));
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao buscar prêmios');
    expect(screen.queryByLabelText('Valor do 1º lugar (R$)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByLabelText('Valor do 1º lugar (R$)')).toBeInTheDocument();
  });

  it('salvar: toast e relê', async () => {
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    await screen.findByLabelText('Valor do 1º lugar (R$)');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prêmios' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Prêmios salvos', 'success'));
    expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/ranking-prizes')).toHaveLength(2);
  });

  it('distribuir: AdminSheet, toast com as carteiras creditadas', async () => {
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    await screen.findByLabelText('Valor do 1º lugar (R$)');
    fireEvent.click(screen.getByRole('button', { name: 'Distribuir prêmios' }));
    const dialog = screen.getByRole('dialog', { name: 'Distribuir os prêmios de outubro?' });
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Distribuir prêmios' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Prêmios distribuídos! 2 carteira(s) creditada(s).', 'success'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('distribuir: 409 do servidor aparece dentro da sheet', async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 409, data: { error: 'Prêmios deste mês já foram distribuídos' } } });
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    await screen.findByLabelText('Valor do 1º lugar (R$)');
    fireEvent.click(screen.getByRole('button', { name: 'Distribuir prêmios' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Distribuir prêmios' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Prêmios deste mês já foram distribuídos');
  });

  it('mês já distribuído: botão "Distribuído" travado e aviso', async () => {
    current = { ...CURRENT, distributed: true, distributedAt: '2026-10-31T12:00:00.000Z' };
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    expect(await screen.findByRole('button', { name: 'Distribuído' })).toBeDisabled();
    expect(screen.getByText('Prêmios de outubro já distribuídos')).toBeInTheDocument();
  });

  it('ativar: PUT config-status e mostra a situação devolvida', async () => {
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar prêmios' }));
    await waitFor(() => expect(screen.getByText('Ativos')).toBeInTheDocument());
    expect(api.put).toHaveBeenCalledWith('/ranking-prizes/config-status', { enabled: true });
  });

  it('celular: campos de prêmio e ações continuam lá', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminSettings />, RANKING_ONLY);
    expect(await screen.findByLabelText('Valor do 3º lugar (R$)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Distribuir prêmios' })).toBeInTheDocument();
  });
});
