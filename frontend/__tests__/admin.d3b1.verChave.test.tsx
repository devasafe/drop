/**
 * D3b-1 · correções finais (item A) — "Ver chave" do Pix manual do DROP em /admin/transfers.
 * Botão só na linha do Pix manual e só com payout:release (mesmo critério de "Resolver"). A folha busca
 * GET /admin/transfers/:id/pix-key e mostra motoboy, valor, tipo e chave completa, com "Copiar chave" e o aviso
 * de que a consulta fica no Histórico do Dinheiro. Erro → "Tentar de novo". Fechar a folha apaga a chave.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminTransfersPage from '../pages/admin/transfers';
import { ACTION_TYPE_LABEL, ADMIN_MONEY_ACTION_TYPES } from '../lib/adminMoney';

let mockCan: (p: string) => boolean = () => true;
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/transfers', asPath: '/admin/transfers' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' },
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const get = api.get as jest.Mock;
const CHAVE = '98765432100';

const MANUAL = {
  id: 't9', orderId: 'ordDDDDDD', storeName: 'Sabor da Vila', motoboyName: 'Carlos Lima', status: 'failed_final',
  amount: 8.9, attempts: 0, lastError: 'PLATFORM_MANUAL_PIX', pixKeyMasked: '***.***.***-00', payer: 'platform',
};
const DA_LOJA = {
  id: 't1', orderId: 'ordAAAAAA', storeName: 'Eletro Center', motoboyName: 'Júlia Santos', status: 'failed_final',
  amount: 12, attempts: 3, lastError: 'saldo insuficiente', pixKeyMasked: 'j***@g***.com', payer: 'store',
};

let revealResult: () => Promise<unknown>;
beforeEach(() => {
  jest.clearAllMocks();
  mockCan = () => true;
  revealResult = () => Promise.resolve({ data: { success: true, data: { pixKey: CHAVE, pixKeyType: 'CPF', motoboyName: 'Carlos Lima', amount: 8.9 } } });
  get.mockImplementation((url: string) => {
    if (url === '/admin/transfers') return Promise.resolve({ data: { success: true, data: [MANUAL, DA_LOJA], nextCursor: null } });
    if (url === '/admin/transfers/t9/pix-key') return revealResult();
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
});

const linha = (quem: string) => screen.getByText(quem).closest('tr') as HTMLElement;

it('o tipo de ação novo tem rótulo no Histórico do Dinheiro', () => {
  expect(ADMIN_MONEY_ACTION_TYPES).toContain('motoboy_transfer_pix_reveal');
  expect(ACTION_TYPE_LABEL.motoboy_transfer_pix_reveal).toBe('Chave Pix revelada (Pix manual do DROP)');
});

it('"Ver chave" só na linha do Pix manual', async () => {
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  expect(within(linha('Sabor da Vila → Carlos Lima')).getByRole('button', { name: 'Ver chave' })).toBeInTheDocument();
  expect(within(linha('Eletro Center → Júlia Santos')).queryByRole('button', { name: 'Ver chave' })).toBeNull();
});

it('sem payout:release: sem "Ver chave"', async () => {
  mockCan = (p) => p === 'payout:view';
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  expect(screen.queryByRole('button', { name: 'Ver chave' })).toBeNull();
});

it('abre a folha, busca a rota e mostra a chave completa com "Copiar chave" e o aviso', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  fireEvent.click(within(linha('Sabor da Vila → Carlos Lima')).getByRole('button', { name: 'Ver chave' }));
  const dialog = await screen.findByRole('dialog', { name: 'Chave Pix do motoboy' });
  expect(await within(dialog).findByText(CHAVE)).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/admin/transfers/t9/pix-key');
  expect(dialog).toHaveTextContent('Carlos Lima');
  expect(dialog).toHaveTextContent('R$ 8,90');
  expect(dialog).toHaveTextContent('CPF');
  expect(dialog).toHaveTextContent('Esta consulta fica registrada no Histórico do Dinheiro.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar chave' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(CHAVE));
});

it('erro mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
  revealResult = () => Promise.reject(new Error('rede'));
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  fireEvent.click(within(linha('Sabor da Vila → Carlos Lima')).getByRole('button', { name: 'Ver chave' }));
  const dialog = await screen.findByRole('dialog', { name: 'Chave Pix do motoboy' });
  expect(await within(dialog).findByText('Não foi possível buscar a chave Pix.')).toBeInTheDocument();
  expect(within(dialog).queryByText(CHAVE)).toBeNull();
  revealResult = () => Promise.resolve({ data: { success: true, data: { pixKey: CHAVE, pixKeyType: 'CPF', motoboyName: 'Carlos Lima', amount: 8.9 } } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tentar de novo' }));
  expect(await within(dialog).findByText(CHAVE)).toBeInTheDocument();
  expect(get.mock.calls.filter(([u]) => u === '/admin/transfers/t9/pix-key')).toHaveLength(2);
});

it('fechar a folha apaga a chave', async () => {
  render(<AdminTransfersPage />);
  await screen.findByText('Sabor da Vila → Carlos Lima');
  fireEvent.click(within(linha('Sabor da Vila → Carlos Lima')).getByRole('button', { name: 'Ver chave' }));
  const dialog = await screen.findByRole('dialog', { name: 'Chave Pix do motoboy' });
  await within(dialog).findByText(CHAVE);
  // O X do Sheet também se chama "Fechar"; o último é o botão do rodapé.
  const fechar = within(dialog).getAllByRole('button', { name: 'Fechar' });
  fireEvent.click(fechar[fechar.length - 1]);
  await waitFor(() => expect(screen.queryByText(CHAVE)).toBeNull());
  // Reabrir busca de novo (nada guardado da consulta anterior).
  revealResult = () => new Promise(() => {});
  fireEvent.click(within(linha('Sabor da Vila → Carlos Lima')).getByRole('button', { name: 'Ver chave' }));
  await screen.findByRole('dialog', { name: 'Chave Pix do motoboy' });
  expect(screen.queryByText(CHAVE)).toBeNull();
});
