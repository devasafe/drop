/**
 * D3a · P3.4 · Lojas → Asaas e mensalidades (telas 27 e 28): números da mensalidade, tabela, detalhe com o
 * cartão Asaas, desconectar com impacto na AdminSheet (sem motivo, K5), confirmação do cartão em AdminSheet,
 * fail closed (lojas, mensalidades e modo) e celular.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminLojasAsaas from '../pages/admin/lojas-asaas';
import api from '../lib/api';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockMe = { _id: 'me', id: 'me', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' };
const mockToast = jest.fn();
const mockCard = jest.fn();
const mockRetryMode = jest.fn();
let mockSaas: Record<string, unknown> = {};

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/lojas-asaas', asPath: '/admin/lojas-asaas' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, token: null, loading: false, permissionsLoading: false, can: () => true }),
}));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/drop/asaas/AsaasConnectCard', () => ({
  AsaasConnectCard: (p: Record<string, unknown>) => { mockCard(p); return <div data-testid="asaas-card">{String(p.apiBase)}</div>; },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const LOJAS = [
  { storeId: 's1', name: 'Loja Um', status: 'valid', environment: 'production', apiKeyLast4: '3456', lastCheckedAt: null },
  { storeId: 's2', name: 'Loja Dois', status: 'none', environment: null, apiKeyLast4: null, lastCheckedAt: null },
];
const SB = [
  { storeId: 's1', status: 'past_due', trialEndsAt: null, paidUntil: '2026-12-05T12:00:00.000Z', customFee: null, fee: 49.9 },
  { storeId: 's2', status: 'trialing', trialEndsAt: '2026-10-20T12:00:00.000Z', paidUntil: null, customFee: 0, fee: 0 },
];
const reads = (over: { lojas?: () => Promise<unknown>; billing?: () => Promise<unknown> } = {}) =>
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/admin/stores/asaas') return over.lojas ? over.lojas() : Promise.resolve({ data: { success: true, data: LOJAS } });
    if (url === '/admin/stores/saas-billing') return over.billing ? over.billing() : Promise.resolve({ data: { success: true, data: SB } });
    if (url === '/settings/saas') return Promise.resolve({ data: { egressIp: '203.0.113.7' } });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
const kpi = (label: string) => screen.getByText(label).nextSibling as HTMLElement;
const lojaRow = (name: string) => screen.getByRole('button', { name }).closest('tr') as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false, error: false, retry: mockRetryMode };
  reads();
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true, data: { status: 'none' } } });
});
afterEach(() => resetViewport());

describe('Asaas e mensalidades · lista (tela 27)', () => {
  it('números da mensalidade e a tabela com conta Asaas e mensalidade', async () => {
    render(<AdminLojasAsaas />);
    await screen.findByRole('button', { name: 'Loja Um' });
    expect(kpi('Em dia')).toHaveTextContent('0');
    expect(kpi('Em teste')).toHaveTextContent('1');
    expect(kpi('Atrasadas')).toHaveTextContent('1');
    expect(kpi('Pausadas')).toHaveTextContent('0');
    const um = lojaRow('Loja Um');
    expect(within(um).getByText('Chave válida')).toBeInTheDocument();
    expect(within(um).getByText('••••3456 · produção')).toBeInTheDocument();
    expect(within(um).getByText('Atrasada')).toBeInTheDocument();
    expect(within(um).getByText('pago até 05/12/2026')).toBeInTheDocument();
    expect(within(um).getByText('R$ 49,90')).toBeInTheDocument();
    const dois = lojaRow('Loja Dois');
    expect(within(dois).getByText('Não conectada')).toBeInTheDocument();
    expect(within(dois).getByText('teste até 20/10/2026')).toBeInTheDocument();
    expect(within(dois).getByText('R$ 0,00 · especial')).toBeInTheDocument();
  });

  it('modo custódia: avisa que as contas por loja só valem no modo direto', async () => {
    mockSaas = { ...mockSaas, settlementMode: 'custodia' };
    render(<AdminLojasAsaas />);
    expect(await screen.findByText(/as contas por loja só valem no modo direto/)).toBeInTheDocument();
  });

  it('modo desconhecido: aviso com "Tentar de novo", sem presumir o modo', async () => {
    mockSaas = { ...mockSaas, settlementMode: null, error: true };
    render(<AdminLojasAsaas />);
    const aviso = await screen.findByText('Não deu para saber o modo da plataforma');
    fireEvent.click(within(aviso.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Tentar de novo' }));
    expect(mockRetryMode).toHaveBeenCalledTimes(1);
  });

  it('mensalidades que não carregam: aviso com "Tentar de novo" e nenhum número', async () => {
    let fail = true;
    reads({ billing: () => (fail ? Promise.reject({ response: { status: 500 } }) : Promise.resolve({ data: { success: true, data: SB } })) });
    render(<AdminLojasAsaas />);
    const aviso = await screen.findByText('Não deu para carregar as mensalidades');
    expect(screen.queryByText('Atrasadas')).toBeNull();
    expect(within(lojaRow('Loja Um')).getAllByText('—')).toHaveLength(2);
    fail = false;
    fireEvent.click(within(aviso.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Atrasadas')).toBeInTheDocument();
  });

  it('lojas que não carregam: erro na tabela com "Tentar de novo", nunca lista vazia', async () => {
    let fail = true;
    reads({ lojas: () => (fail ? Promise.reject({ response: { status: 500, data: {} } }) : Promise.resolve({ data: { success: true, data: LOJAS } })) });
    render(<AdminLojasAsaas />);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar as lojas.');
    fail = false;
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: 'Loja Um' })).toBeInTheDocument();
  });
});

describe('Asaas e mensalidades · loja (tela 28)', () => {
  it('detalhe: cartão Asaas sem o "Desconectar" antigo, mensalidade e valor especial', async () => {
    render(<AdminLojasAsaas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Loja Um' }));
    const detalhe = screen.getByRole('region', { name: 'Loja Um' });
    expect(within(detalhe).getByTestId('asaas-card')).toHaveTextContent('/admin/stores/s1/asaas');
    const props = mockCard.mock.calls[mockCard.mock.calls.length - 1][0];
    expect(props.allowDisconnect).toBeUndefined();
    expect(typeof props.confirmAction).toBe('function');
    expect(props.termsSignedByStore).toBe(true);
    expect(within(detalhe).getByLabelText('Valor especial de Loja Um')).toBeInTheDocument();
    expect(within(detalhe).getByRole('button', { name: 'Desconectar conta Asaas' })).toBeInTheDocument();
  });

  it('loja sem conta Asaas: sem "Desconectar"', async () => {
    render(<AdminLojasAsaas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Loja Dois' }));
    const detalhe = screen.getByRole('region', { name: 'Loja Dois' });
    expect(within(detalhe).queryByRole('button', { name: 'Desconectar conta Asaas' })).toBeNull();
  });

  it('desconectar: impacto, sem campo de motivo (K5), DELETE sem corpo e a lista relida', async () => {
    render(<AdminLojasAsaas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Loja Um' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar conta Asaas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar a conta Asaas' });
    expect(within(dialog).getByText(/Os pagamentos desta loja deixam de funcionar/)).toBeInTheDocument();
    expect(within(dialog).getByText(/••••3456/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Motivo/)).toBeNull();
    const btn = within(dialog).getByRole('button', { name: 'Desconectar' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((api.delete as jest.Mock).mock.calls).toEqual([['/admin/stores/s1/asaas']]);
    expect(mockToast).toHaveBeenCalledWith('Conta Asaas desconectada.', 'success');
    expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/admin/stores/asaas')).toHaveLength(2);
  });

  it('desconectar com erro do servidor: a mensagem aparece dentro da sheet', async () => {
    (api.delete as jest.Mock).mockRejectedValue({
      response: { status: 404, data: { success: false, error: { message: 'Esta loja não tem conta Asaas conectada', code: 'STORE_ASAAS_NOT_FOUND' } } },
    });
    render(<AdminLojasAsaas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Loja Um' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar conta Asaas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar a conta Asaas' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esta loja não tem conta Asaas conectada');
  });

  it('a confirmação do cartão (regerar token) abre uma AdminSheet, não o window.confirm', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
    render(<AdminLojasAsaas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Loja Um' }));
    const { confirmAction } = mockCard.mock.calls[mockCard.mock.calls.length - 1][0];
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => { answer = confirmAction('Gerar um novo token? O token atual deixa de valer.'); });
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar' });
    expect(within(dialog).getByText('Gerar um novo token? O token atual deixa de valer.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(answer).resolves.toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('celular: cartões e o detalhe abaixo', async () => {
    setViewportWidth(360);
    render(<AdminLojasAsaas />);
    const lista = await screen.findByRole('list', { name: 'Lojas' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(lista).getByRole('button', { name: 'Loja Um' }));
    expect(screen.getByRole('region', { name: 'Loja Um' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar conta Asaas' }).className).toContain('touch');
  });
});
