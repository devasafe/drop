import { fireEvent, screen, waitFor } from '@testing-library/react';
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

const CONFIG = {
  _id: 'cfg', commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5,
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10,
  motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10,
  storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15, updatedAt: '2026-09-22T12:00:00.000Z',
};
const SW = {
  rankingPrizesEnabled: false, benefitsRedeemEnabled: false, gamificationPointsEnabled: false,
  settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5, directTransfersEnabled: false,
};
const GERENTE = adminAuth('gerente_geral', ['settings:manage']);
const sumRow = (label: string) => screen.getByText(label).parentElement as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockQuery = {};
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/platform-config') return Promise.resolve({ data: CONFIG });
    if (url === '/admin/switches') return Promise.resolve({ data: SW });
    if (url === '/admin/switches/settlement-preview') return Promise.resolve({ data: { blockers: [], risks: [], confirmPhrase: 'X' } });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  (api.put as jest.Mock).mockResolvedValue({ data: { config: CONFIG, message: 'ok' } });
});

describe('abas e permissão', () => {
  it('gerente com settings:manage em ?aba=modo fica em Taxas e tempos (Modo é só do CEO) e não lê /admin/switches', async () => {
    mockQuery = { aba: 'modo' };
    renderAdminPage(<AdminSettings />, GERENTE);
    expect(screen.getByRole('heading', { name: 'Regras e taxas · Taxas e tempos' })).toBeInTheDocument();
    await screen.findByLabelText('Plano 2 · com motoboys (%)');
    expect(api.get).not.toHaveBeenCalledWith('/admin/switches');
  });

  it('CEO em ?aba=modo: modo da plataforma e mensalidade, lidos de /admin/switches', async () => {
    mockQuery = { aba: 'modo' };
    renderAdminPage(<AdminSettings />);
    expect(screen.getByRole('heading', { name: 'Regras e taxas · Modo da plataforma' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Modo da plataforma' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mensalidade SaaS' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/switches');
    expect(api.get).not.toHaveBeenCalledWith('/settings/platform-config');
  });

  it('Modo: leitura falhou → erro com "Tentar de novo" e nenhum modo presumido', async () => {
    mockQuery = { aba: 'modo' };
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao ler os freios' } } });
    renderAdminPage(<AdminSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao ler os freios');
    expect(screen.queryByText(/Atual:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Modo da plataforma' })).toBeInTheDocument();
  });

  it('portão: sem settings:manage sai da tela e nada é lido', async () => {
    renderAdminPage(<AdminSettings />, adminAuth('marketing', ['theme:edit']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('Mensalidade SaaS: valor padrão em reais (parseAmount)', () => {
  const preencher = async (value: string) => {
    mockQuery = { aba: 'modo' };
    (api.put as jest.Mock).mockResolvedValue({ data: SW });
    renderAdminPage(<AdminSettings />);
    fireEvent.change(await screen.findByLabelText('Valor padrão (R$)'), { target: { value } });
  };

  it.each(['1e3', '1.999', '10abc', '-5', ''])('"%s" não envia', async (value) => {
    await preencher(value);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar mensalidade' }));
    expect(api.put).not.toHaveBeenCalled();
    expect(await screen.findByText('Valor padrão inválido: use só números, com até 2 casas (ex.: 49,90).')).toBeInTheDocument();
  });

  it.each([['49,90', 49.9], ['0', 0], ['59.9', 59.9]])('"%s" envia saasMonthlyFee %p', async (value, fee) => {
    await preencher(value);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar mensalidade' }));
    expect(await screen.findByText('Mensalidade salva.')).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith('/admin/switches', {
      saasMonthlyFee: fee, saasTrialDays: 14, saasGraceDays: 5, directTransfersEnabled: false,
    });
  });
});

describe('Taxas e tempos', () => {
  it('mudança marcada, aviso de-para, contador e simulação com o antes', async () => {
    renderAdminPage(<AdminSettings />, GERENTE);
    const plan2 = await screen.findByLabelText('Plano 2 · com motoboys (%)');
    expect(sumRow('DROP fica com')).toHaveTextContent('R$ 16,60');
    expect(screen.getByRole('button', { name: 'Nenhuma mudança' })).toBeDisabled();

    fireEvent.change(plan2, { target: { value: '12' } });
    expect(screen.getByText('Era 15%')).toBeInTheDocument();
    expect(screen.getByText('Plano 2: 15% → 12%')).toBeInTheDocument();
    expect(sumRow('DROP fica com')).toHaveTextContent('R$ 13,60');
    expect(screen.getByText('Antes da mudança: R$ 16,60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar 1 mudança' })).toBeEnabled();
  });

  it('a simulação muda com valor, distância e plano', async () => {
    renderAdminPage(<AdminSettings />, GERENTE);
    await screen.findByLabelText('Plano 2 · com motoboys (%)');
    fireEvent.click(screen.getByRole('button', { name: 'Plano 1' }));
    expect(sumRow('Cliente paga')).toHaveTextContent('R$ 100,00');
    fireEvent.click(screen.getByRole('button', { name: 'Plano 3' }));
    fireEvent.change(screen.getByLabelText('Valor dos produtos (R$)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '5' } });
    expect(sumRow('Cliente paga')).toHaveTextContent('R$ 210,00');
    expect(sumRow('DROP fica com')).toHaveTextContent('R$ 12,00');
  });

  it('"Descartar" volta ao salvo', async () => {
    renderAdminPage(<AdminSettings />, GERENTE);
    const plan2 = (await screen.findByLabelText('Plano 2 · com motoboys (%)')) as HTMLInputElement;
    fireEvent.change(plan2, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(plan2.value).toBe('15');
    expect(screen.getByRole('button', { name: 'Nenhuma mudança' })).toBeDisabled();
  });

  it('campo vazio: "Preencha um número" e não deixa salvar', async () => {
    renderAdminPage(<AdminSettings />, GERENTE);
    fireEvent.change(await screen.findByLabelText('Por km de rota (R$)'), { target: { value: '' } });
    expect(screen.getByText('Preencha um número')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar 1 mudança' })).toBeDisabled();
  });

  it('salvar sem mudar comissão: PUT com a config inteira, toast e volta a "Nenhuma mudança"', async () => {
    (api.put as jest.Mock).mockResolvedValue({ data: { config: { ...CONFIG, motoboyCutPerKm: 2 }, message: 'ok' } });
    renderAdminPage(<AdminSettings />, GERENTE);
    fireEvent.change(await screen.findByLabelText('Por km de rota (R$)'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Regras salvas', 'success'));
    expect(api.put).toHaveBeenCalledWith('/settings/platform-config', { ...CONFIG, motoboyCutPerKm: 2 });
    expect(screen.getByRole('button', { name: 'Nenhuma mudança' })).toBeDisabled();
  });

  it('leitura falhou: erro com "Tentar de novo", sem formulário', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao buscar configurações' } } });
    renderAdminPage(<AdminSettings />, GERENTE);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao buscar configurações');
    expect(screen.queryByLabelText('Plano 2 · com motoboys (%)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByLabelText('Plano 2 · com motoboys (%)')).toBeInTheDocument();
  });

  it('mostra a data da última alteração', async () => {
    renderAdminPage(<AdminSettings />, GERENTE);
    expect(await screen.findByText('Última alteração: 22/09/2026')).toBeInTheDocument();
  });

  it('celular: campos, simulação e salvar continuam lá', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminSettings />, GERENTE);
    expect(await screen.findByLabelText('Espera pelo cliente ausente (min)')).toBeInTheDocument();
    expect(screen.getByText('DROP fica com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nenhuma mudança' })).toBeInTheDocument();
  });
});
