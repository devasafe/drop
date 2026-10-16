import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminTransfers from '../pages/admin/transfers';
import MotoboyTransfersCard from '../components/drop/asaas/MotoboyTransfersCard';
import { ADMIN_AREAS, visibleAdminAreas } from '../lib/adminNav';
import { humanizeTransferError } from '../lib/transferErrors';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/transfers' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'm1', id: 'm1', activeRole: 'ceo', role: 'ceo', name: 'C' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const rows = [
  { id: 't1', orderId: 'ordAAAAAA', storeName: 'Loja Um', motoboyName: 'Zé', status: 'failed', amount: 8, attempts: 2, lastError: 'MOTOBOY_PIX_KEY_MISSING', pixKeyMasked: '***.***.***-12' },
  { id: 't2', orderId: 'ordBBBBBB', storeName: 'Loja Dois', motoboyName: 'Ana', status: 'uncertain', amount: 6, attempts: 1, lastError: 'UNCERTAIN', pixKeyMasked: 'a***@g***.com' },
  { id: 't3', orderId: 'ordCCCCCC', storeName: 'Loja Tres', motoboyName: 'Beto', status: 'failed_final', amount: 5, attempts: 6, lastError: 'AMOUNT_OVER_LIMIT', pixKeyMasked: '***4000' },
  { id: 't4', orderId: 'ordDDDDDD', storeName: 'Loja Quatro', motoboyName: 'Cris', status: 'done', amount: 4, attempts: 1, lastError: null, pixKeyMasked: '***.***.***-34' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: rows } });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: {} } });
});

describe('admin/transfers', () => {
  test('lista com erro legível, chave mascarada e botões conforme o status', async () => {
    render(<AdminTransfers />);
    expect(await screen.findByText('O motoboy ainda não cadastrou a chave Pix')).toBeInTheDocument();
    expect(screen.getByText('Resultado incerto no Asaas — confira no painel antes de qualquer ação')).toBeInTheDocument();
    expect(screen.getByText(/\*\*\*\.\*\*\*\.\*\*\*-12/)).toBeInTheDocument();
    // failed + failed_final podem reenviar; uncertain nunca; done nada.
    expect(screen.getAllByText('Tentar agora')).toHaveLength(2);
    expect(screen.getAllByText('Resolver')).toHaveLength(3);
  });

  test('filtro de status vai na query', async () => {
    render(<AdminTransfers />);
    await screen.findByText(/Loja Um/);
    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'uncertain' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/transfers', { params: { status: 'uncertain' } }));
  });

  test('reenviar chama o retry', async () => {
    render(<AdminTransfers />);
    await screen.findByText(/Loja Um/);
    fireEvent.click(screen.getAllByText('Tentar agora')[0]);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/transfers/t1/retry'));
  });

  test('resolver exige nota de 10+ caracteres', async () => {
    render(<AdminTransfers />);
    await screen.findByText(/Loja Dois/);
    fireEvent.click(screen.getAllByText('Resolver')[1]);
    const confirm = screen.getByText('Confirmar resolução');
    fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'curta' } });
    expect(confirm.closest('button')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'conferido no painel do Asaas' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/transfers/t2/resolve', { note: 'conferido no painel do Asaas' }));
  });

  test('menu: aba Pix aos motoboys com payout:view e marcada directOnly', () => {
    const tab = ADMIN_AREAS.flatMap((a) => a.tabs).find((t) => t.href === '/admin/transfers');
    expect(tab).toBeDefined();
    expect(tab!.directOnly).toBe(true);
    expect(tab!.permission).toBe('payout:view');
    const seen = (can: (p: string) => boolean) => visibleAdminAreas({ can, isCeo: false, settlementMode: 'direto', custodyOpen: false })
      .some((a) => a.tabs.some((t) => t.href === '/admin/transfers'));
    expect(seen((p) => p === 'payout:view')).toBe(true);
    expect(seen(() => false)).toBe(false);
  });
});

test('humanizeTransferError', () => {
  expect(humanizeTransferError('DAILY_LIMIT')).toMatch(/limite diário/i);
  expect(humanizeTransferError(null)).toBeNull();
  expect(humanizeTransferError('Algo estranho')).toBe('Algo estranho');
});

describe('seller: pagamentos a motoboys', () => {
  test('mostra a chave mascarada e o motivo legível', async () => {
    render(<MotoboyTransfersCard storeId="s1" />);
    expect(await screen.findByText('Pagamentos a motoboys')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/stores/s1/transfers');
    expect(await screen.findByText('O motoboy ainda não cadastrou a chave Pix')).toBeInTheDocument();
    expect(screen.getByText(/\*\*\*\.\*\*\*\.\*\*\*-12/)).toBeInTheDocument();
  });
  test('erro na API não quebra a página', async () => {
    (api.get as jest.Mock).mockRejectedValue(new Error('x'));
    render(<MotoboyTransfersCard storeId="s1" />);
    expect(await screen.findByText('Pagamentos a motoboys')).toBeInTheDocument();
    expect(await screen.findByText('Não foi possível carregar os pagamentos.')).toBeInTheDocument();
  });
});
