/**
 * Fix round 1 — R27: saque incerto ganha "Resolver saque incerto" (no lugar do "Marcar Pago",
 * que chamava uma rota inexistente) e o selo "Incerto — conferir no painel Asaas".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminWithdrawals from '../pages/admin/withdrawals';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/withdrawals' }) }));
const mockAuth = { user: { _id: 'c1', activeRole: 'ceo', role: 'ceo', name: 'C' }, can: () => true, loading: false, permissionsLoading: false };
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const base = { motoboyName: 'Zé', amount: 25, requestedAt: '2026-10-08T10:00:00Z' };
const incerto = { ...base, _id: 'w1', status: 'approved', uncertainAt: '2026-10-08T10:01:00Z', approvedAt: new Date().toISOString() };
const emVoo = { ...base, _id: 'w2', motoboyName: 'Ana', status: 'approved', uncertainAt: null, approvedAt: new Date().toISOString() };
const travado = { ...base, _id: 'w3', motoboyName: 'Bia', status: 'approved', uncertainAt: null, approvedAt: new Date(Date.now() - 11 * 60_000).toISOString() };

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((u: string) => {
    if (u === '/withdrawals/pending') return Promise.resolve({ data: [] });
    if (u === '/withdrawals/all') return Promise.resolve({ data: { withdrawals: [incerto, emVoo, travado] } });
    if (u === '/withdrawals/ceo-wallet') return Promise.resolve({ data: { balance: 0 } });
    if (u === '/withdrawals/admin/config') return Promise.resolve({ data: { autoApproveWithdrawals: false } });
    return Promise.reject(new Error('n/a'));
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { message: 'ok' } });
});

async function abrirHistorico() {
  render(<AdminWithdrawals />);
  fireEvent.click(await screen.findByText(/Histórico/));
}

test('selo de incerto; "Resolver" só no incerto e no travado (>10 min); sem "Marcar Pago"', async () => {
  await abrirHistorico();
  expect(screen.getByText('Incerto — conferir no painel Asaas')).toBeInTheDocument();
  expect(screen.getAllByText('Resolver saque incerto')).toHaveLength(2);
  expect(screen.queryByText('Marcar Pago')).not.toBeInTheDocument();
});

test('paid: exige escolha e nota, envia o id da transferência e recarrega', async () => {
  await abrirHistorico();
  fireEvent.click(screen.getAllByText('Resolver saque incerto')[0]);
  fireEvent.click(screen.getByText('Confirmar resolução'));
  expect(await screen.findByText('Escolha o que o painel do Asaas mostra.')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('O Pix saiu (concluir o saque)'));
  fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'curta' } });
  fireEvent.click(screen.getByText('Confirmar resolução'));
  expect(await screen.findByText(/pelo menos 10 caracteres/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Id da transferência no Asaas'), { target: { value: 'tr_123' } });
  fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'Conferido no painel: DONE' } });
  const callsBefore = (api.get as jest.Mock).mock.calls.filter(([u]) => u === '/withdrawals/all').length;
  fireEvent.click(screen.getByText('Confirmar resolução'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/withdrawals/w1/resolve-uncertain', {
    outcome: 'paid', asaasTransferId: 'tr_123', note: 'Conferido no painel: DONE',
  }));
  await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter(([u]) => u === '/withdrawals/all').length).toBeGreaterThan(callsBefore));
});

test('not_sent: envia sem id da transferência; erro do backend aparece', async () => {
  (api.post as jest.Mock).mockRejectedValue({ response: { data: { error: 'Saque não está incerto' } } });
  await abrirHistorico();
  fireEvent.click(screen.getAllByText('Resolver saque incerto')[1]);
  fireEvent.click(screen.getByLabelText('O Pix não saiu (voltar para pendente)'));
  fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'Nada no extrato do Asaas' } });
  fireEvent.click(screen.getByText('Confirmar resolução'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/withdrawals/w3/resolve-uncertain', { outcome: 'not_sent', note: 'Nada no extrato do Asaas' }));
  expect(await screen.findByText('Saque não está incerto')).toBeInTheDocument();
});
