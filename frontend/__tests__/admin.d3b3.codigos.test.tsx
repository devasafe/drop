/**
 * D3b-3 · P4.7 — códigos novos nas telas que já existiam: Caixa (403 CASHBOX_SELF_APPROVAL com texto próprio,
 * 409 CASHBOX_WITHDRAWAL_NOT_PENDING relê a lista), Verificações (409 VERIFICATION_NOT_PENDING é "já feito",
 * o 400 antigo continua) e Saques (409 WITHDRAWAL_NOT_PENDING com currentStatus continua "já feito").
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminCashboxPage from '../pages/admin/app-cashbox';
import { isVerificationAlreadyDecided } from '../lib/adminVerificacoes';
import { isWithdrawalAlreadyHandled } from '../components/admin/dinheiro/withdrawalRules';
import { resetViewport } from './helpers/viewport';

const mockToast = jest.fn();
const mockUser = { id: 'adm1', name: 'Asafe', email: 'a@x.com', role: 'ceo', activeRole: 'ceo' };

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/app-cashbox', asPath: '/admin/app-cashbox' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const put = api.put as jest.Mock;

const CASHBOX = { _id: 'cb', balance: 7912.4, totalIncome: 60000, totalExpenses: 10129.88, pendingObligations: 9196.7, platformNet: 49870.12 };
const WITHDRAWALS = {
  withdrawals: [
    { _id: 'cw1', amount: 5000, status: 'pending', bankInfo: { bank: 'Banco X', account: '0001 / 123-4', holderName: 'DROP LTDA' }, requestedAt: '2026-10-16T10:00:00Z' },
  ],
};
const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });
const withdrawalReads = () => get.mock.calls.filter(([u]) => u === '/admin/app-cashbox/withdrawals').length;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  get.mockImplementation((url: string) => {
    if (url === '/admin/app-cashbox') return Promise.resolve({ data: CASHBOX });
    if (url === '/admin/app-cashbox/statement') return Promise.resolve({ data: { statement: [] } });
    if (url === '/admin/app-cashbox/withdrawals') return Promise.resolve({ data: WITHDRAWALS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  put.mockResolvedValue({ data: { success: true } });
});

describe('Caixa', () => {
  const openApprove = async () => {
    render(<AdminCashboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Aprovar$/ }));
    return screen.getByRole('dialog', { name: 'Aprovar retirada' });
  };

  it('a folha de aprovar explica a regra de quem aprova', async () => {
    const sheet = await openApprove();
    expect(within(sheet).getByText(/Quem pediu a retirada não aprova a própria/)).toBeInTheDocument();
  });

  it('403 CASHBOX_SELF_APPROVAL: "Outra pessoa precisa aprovar esta retirada" (não "sem permissão"); a folha fica aberta', async () => {
    put.mockRejectedValueOnce(http(403, { error: 'Outra pessoa precisa aprovar esta retirada', code: 'CASHBOX_SELF_APPROVAL' }));
    const sheet = await openApprove();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar aprovação' }));
    expect(await within(sheet).findByText('Outra pessoa precisa aprovar esta retirada')).toBeInTheDocument();
    expect(within(sheet).queryByText('Você não tem permissão para isso')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Aprovar retirada' })).toBeInTheDocument();
  });

  it('403 de permissão continua "Você não tem permissão para isso"', async () => {
    put.mockRejectedValueOnce(http(403, { error: 'Permissão negada. Você precisa de: cashbox:approve_withdrawal' }));
    const sheet = await openApprove();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar aprovação' }));
    expect(await within(sheet).findByText('Você não tem permissão para isso')).toBeInTheDocument();
  });

  it('aprovar retirada já decidida (409 CASHBOX_WITHDRAWAL_NOT_PENDING): aviso e lista relida', async () => {
    put.mockRejectedValueOnce(http(409, { error: 'Retirada não está pendente', code: 'CASHBOX_WITHDRAWAL_NOT_PENDING', currentStatus: 'approved' }));
    const sheet = await openApprove();
    const reads = withdrawalReads();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar aprovação' }));
    expect(await within(sheet).findByText('Esta retirada já foi decidida. A lista foi atualizada.')).toBeInTheDocument();
    await waitFor(() => expect(withdrawalReads()).toBeGreaterThan(reads));
  });

  it('recusar retirada já decidida (409 CASHBOX_WITHDRAWAL_NOT_PENDING): aviso e lista relida', async () => {
    put.mockRejectedValueOnce(http(409, { error: 'Retirada não está pendente', code: 'CASHBOX_WITHDRAWAL_NOT_PENDING', currentStatus: 'rejected' }));
    render(<AdminCashboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Recusar$/ }));
    const sheet = screen.getByRole('dialog', { name: 'Recusar retirada' });
    fireEvent.change(within(sheet).getByLabelText('Motivo da recusa'), { target: { value: 'Conta errada' } });
    const reads = withdrawalReads();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Recusar retirada' }));
    expect(await within(sheet).findByText('Esta retirada já foi decidida. A lista foi atualizada.')).toBeInTheDocument();
    await waitFor(() => expect(withdrawalReads()).toBeGreaterThan(reads));
  });
});

describe('Verificações: "já feito" do lote', () => {
  it.each(['approved', 'rejected', 'none'])('409 VERIFICATION_NOT_PENDING (%s) conta como já decidido', (currentStatus) => {
    expect(isVerificationAlreadyDecided(http(409, { error: 'Documento não está pendente', code: 'VERIFICATION_NOT_PENDING', currentStatus }))).toBe(true);
  });
  it('o 400 antigo "não está pendente" continua aceito (compatibilidade)', () => {
    expect(isVerificationAlreadyDecided(http(400, { error: 'Facial não está pendente' }))).toBe(true);
  });
  it('outro 409, 409 sem código e outros erros não contam', () => {
    expect(isVerificationAlreadyDecided(http(409, { error: 'x', code: 'WITHDRAWAL_NOT_PENDING' }))).toBe(false);
    expect(isVerificationAlreadyDecided(http(409, { error: 'Documento não está pendente' }))).toBe(false);
    expect(isVerificationAlreadyDecided(http(500, { error: 'Erro interno do servidor' }))).toBe(false);
    expect(isVerificationAlreadyDecided(new Error('Network Error'))).toBe(false);
  });
});

describe('Saques: "já feito" do lote (E8)', () => {
  it('409 WITHDRAWAL_NOT_PENDING com currentStatus processed é "já saiu da fila"', () => {
    expect(isWithdrawalAlreadyHandled(http(409, { error: 'Saque não está pendente', code: 'WITHDRAWAL_NOT_PENDING', currentStatus: 'processed' }))).toBe(true);
  });
  it.each(['approved', 'rejected', 'pending', undefined])('409 WITHDRAWAL_NOT_PENDING com currentStatus %s NÃO é "já feito"', (currentStatus) => {
    expect(isWithdrawalAlreadyHandled(http(409, { error: 'Saque não está pendente', code: 'WITHDRAWAL_NOT_PENDING', currentStatus }))).toBe(false);
  });
});
