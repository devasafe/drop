/**
 * D3a · P4.1 — o outro lado do pedido de acesso: o cliente aprova, recusa ou revoga.
 * Mesmas chamadas de antes; erro em toast (sem alert); CSS só com tokens.
 */
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../lib/api';
import WalletAccessInbox from '../components/WalletAccessInbox';
import { cssViolations } from './helpers/dsTokens';

const mockToast = jest.fn();
let mockHandler: (() => void) | null = null;
const mockOn = jest.fn((_event: string, h: () => void) => {
  mockHandler = h;
  return () => { mockHandler = null; };
});

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: mockOn }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const at = '2026-10-08T10:00:00Z';
const PENDING = {
  _id: 'q1', requestedBy: { _id: 'a1', name: 'Marina', email: 'm@x.com' }, requestedByRole: 'gerente_geral',
  reason: 'Reclamação 123', status: 'pending', expiresAt: null, createdAt: at,
};
const ACTIVE = {
  _id: 'q2', requestedBy: { _id: 'a2', name: 'Caio', email: 'c@x.com' }, requestedByRole: 'ceo',
  reason: 'Auditoria', status: 'approved', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: at,
};

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockHandler = null;
  alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  get.mockResolvedValue({ data: { requests: [PENDING, ACTIVE] } });
  post.mockResolvedValue({ data: {} });
});
afterEach(() => alertSpy.mockRestore());

it('sem pedido pendente nem acesso ativo: não desenha nada', async () => {
  get.mockResolvedValue({ data: { requests: [] } });
  const { container } = render(<WalletAccessInbox />);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/wallet-access/incoming'));
  expect(container).toBeEmptyDOMElement();
});

it('mostra o contador, abre e aprova (POST /wallet-access/:id/approve)', async () => {
  render(<WalletAccessInbox />);
  const fab = await screen.findByRole('button', { name: 'Pedidos de acesso à sua carteira' });
  expect(fab).toHaveTextContent('1');
  fireEvent.click(fab);
  expect(screen.getByText('Marina (Gerente geral)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar por 24 h' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/wallet-access/q1/approve'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
});

it('recusa e revoga com as rotas de hoje', async () => {
  render(<WalletAccessInbox />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pedidos de acesso à sua carteira' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/wallet-access/q1/reject'));
  fireEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/wallet-access/q2/revoke'));
});

it('erro do servidor vai para o toast, sem alert', async () => {
  post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Pedido já respondido' } } });
  render(<WalletAccessInbox />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pedidos de acesso à sua carteira' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar por 24 h' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Pedido já respondido', 'error'));
  expect(window.alert).not.toHaveBeenCalled();
});

it('novo pedido pelo socket: relê e abre o painel', async () => {
  render(<WalletAccessInbox />);
  await screen.findByRole('button', { name: 'Pedidos de acesso à sua carteira' });
  expect(mockOn).toHaveBeenCalledWith('wallet:access_requested', expect.any(Function));
  await act(async () => { mockHandler?.(); });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('region', { name: 'Acessos à sua carteira' })).toBeInTheDocument();
});

it('CSS só com tokens do DS v2 e sem estilo inline', () => {
  const root = path.join(__dirname, '..', 'components');
  expect(cssViolations(fs.readFileSync(path.join(root, 'WalletAccessInbox.module.css'), 'utf8'))).toEqual([]);
  expect(fs.readFileSync(path.join(root, 'WalletAccessInbox.tsx'), 'utf8')).not.toMatch(/style=\{\{/);
});
