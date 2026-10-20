/**
 * D3b-1 · P3.1 — Pix manual do DROP em /admin/transfers (decisão do usuário, 20/10): compensação com culpa
 * platform no SaaS vira MotoboyTransfer com payer 'platform' (failed_final, PLATFORM_MANUAL_PIX). O job nunca a
 * envia e o retry responde 409 TRANSFER_MANUAL_PIX. Na lista: etiqueta "Pix manual do DROP", texto "Pague pelo seu
 * banco e use Resolver", sem "Tentar agora", com "Resolver". Pix da loja (payer store ou lista sem o campo) não muda.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminTransfersPage from '../pages/admin/transfers';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/transfers', asPath: '/admin/transfers' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' },
    can: () => true,
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const MANUAL = {
  id: 't9', orderId: 'ordDDDDDD', storeName: 'Sabor da Vila', motoboyName: 'Carlos Lima', status: 'failed_final',
  amount: 8.9, attempts: 0, lastError: 'PLATFORM_MANUAL_PIX', pixKeyMasked: '***.***.***-12', payer: 'platform',
};
const DA_LOJA = {
  id: 't1', orderId: 'ordAAAAAA', storeName: 'Eletro Center', motoboyName: 'Júlia Santos', status: 'failed_final',
  amount: 12, attempts: 3, lastError: 'saldo insuficiente', pixKeyMasked: 'j***@g***.com', payer: 'store',
};
// Lista de antes da D3b-1 (sem `payer`): continua como Pix da loja.
const SEM_PAYER = {
  id: 't2', orderId: 'ordBBBBBB', storeName: 'Papel e Cia', motoboyName: 'Ana Prado', status: 'failed',
  amount: 9.1, attempts: 1, lastError: 'saldo insuficiente', pixKeyMasked: '***4000',
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: [MANUAL, DA_LOJA, SEM_PAYER], nextCursor: null } });
  post.mockResolvedValue({ data: { success: true, data: {} } });
});
afterEach(() => resetViewport());

const linha = (quem: string) => screen.getByText(quem).closest('tr') as HTMLElement;

it('Pix manual do DROP: etiqueta e "Pague pelo seu banco e use Resolver", sem "Tentar agora", com "Resolver"', async () => {
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  const manual = linha('Sabor da Vila → Carlos Lima');
  expect(within(manual).getByText('Pix manual do DROP')).toBeInTheDocument();
  expect(manual).toHaveTextContent('Pague pelo seu banco e use Resolver');
  expect(manual).not.toHaveTextContent('PLATFORM_MANUAL_PIX');
  expect(within(manual).queryByRole('button', { name: 'Tentar agora' })).toBeNull();
  expect(within(manual).getByRole('button', { name: 'Resolver' })).toBeInTheDocument();
});

it.each([
  ['payer store', 'Eletro Center → Júlia Santos'],
  ['lista sem payer', 'Papel e Cia → Ana Prado'],
])('Pix da loja (%s): sem a etiqueta, com "Tentar agora" e o motivo de sempre', async (_caso, quem) => {
  render(<AdminTransfersPage />);
  await screen.findByText(quem);
  const row = linha(quem);
  expect(within(row).queryByText('Pix manual do DROP')).toBeNull();
  expect(row).not.toHaveTextContent('Pague pelo seu banco');
  expect(row).toHaveTextContent('A loja não tem saldo no Asaas para esta transferência');
  expect(within(row).getByRole('button', { name: 'Tentar agora' })).toBeInTheDocument();
});

it('Resolver no Pix manual: a folha fala do banco do DROP e manda POST resolve { note }', async () => {
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  fireEvent.click(within(linha('Sabor da Vila → Carlos Lima')).getByRole('button', { name: 'Resolver' }));
  const dialog = await screen.findByRole('dialog', { name: 'Resolver Pix' });
  expect(dialog).toHaveTextContent('Pix manual do DROP de R$ 8,90 para Carlos Lima.');
  expect(dialog).toHaveTextContent('Pague pelo seu banco e use Resolver com os dados do comprovante na nota.');
  expect(dialog).not.toHaveTextContent('painel do Asaas antes de resolver');
  const nota = within(dialog).getByLabelText('Nota da conferência') as HTMLTextAreaElement;
  expect(nota.placeholder).toContain('banco do DROP');
  expect(nota.placeholder).not.toContain('Asaas');
  fireEvent.change(within(dialog).getByLabelText('Nota da conferência'), { target: { value: '  Pix pago pelo banco, comprovante 123  ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar resolução' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/transfers/t9/resolve', { note: 'Pix pago pelo banco, comprovante 123' }));
  expect(post).not.toHaveBeenCalledWith('/admin/transfers/t9/retry');
});

it('celular: etiqueta e texto no cartão, sem "Tentar agora"', async () => {
  setViewportWidth(390);
  render(<AdminTransfersPage />);
  const card = (await screen.findByText('Sabor da Vila → Carlos Lima')).closest('li') as HTMLElement;
  expect(within(card).getByText('Pix manual do DROP')).toBeInTheDocument();
  expect(card).toHaveTextContent('Pague pelo seu banco e use Resolver');
  expect(within(card).queryByRole('button', { name: 'Tentar agora' })).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});
