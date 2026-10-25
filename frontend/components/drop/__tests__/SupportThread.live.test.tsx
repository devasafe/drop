import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import api from '../../../lib/api';
import SocketContext from '../../../contexts/SocketContext';
import { SupportThread } from '../SupportThread';

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', id: 'u1' } }) }));
jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const handlers: Record<string, (d: any) => void> = {};
const socket = { on: (ev: string, fn: (d: any) => void) => { handlers[ev] = fn; return () => { delete handlers[ev]; }; }, emit: jest.fn(), isConnected: true } as any;

const order = { _id: 'abc123def456', storeName: 'Eletro Center', status: 'entregue', totalValue: 244, createdAt: '2026-10-03T14:02:00' };
const ticket = (over: any = {}) => ({
  _id: 't1', conversationId: 'c1', subject: 'Pedido #DEF456 · Eletro Center', status: 'aberto', assignedTo: [], order, resolvedAt: null, ...over,
});
const renderThread = (t: any = ticket(), extra: any = {}) => render(
  <SocketContext.Provider value={socket}>
    <SupportThread ticket={t} onBack={jest.fn()} onNewTicket={extra.onNewTicket ?? jest.fn()} />
  </SocketContext.Provider>,
);

beforeEach(() => {
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  get.mockReset(); post.mockReset();
  get.mockResolvedValue({ data: { messages: [{ _id: 'm1', senderId: 'u1', text: 'Chegou só o fone.', createdAt: '2026-10-03T14:51:00' }] } });
});

test('cabeçalho diz o pedido e a situação; card do pedido com loja e total', async () => {
  renderThread(ticket({ status: 'em_atendimento', assignedTo: [{ userId: 's1', name: 'Marina Rocha' }] }));
  expect(screen.getByText('Suporte DROP')).toBeInTheDocument();
  expect(screen.getByText('Chamado sobre o pedido #DEF456')).toBeInTheDocument();
  expect(screen.getByText('Em atendimento')).toBeInTheDocument();
  expect(screen.getByText('#DEF456 · Eletro Center')).toBeInTheDocument();
  expect(screen.getByText(/R\$ 244,00/)).toBeInTheDocument();
  expect(await screen.findByText('Chegou só o fone.')).toBeInTheDocument();
});

test('chamado sem pedido: sem card e sem "sobre o pedido"', async () => {
  renderThread(ticket({ order: null, subject: 'Ajuda pelo app' }));
  await screen.findByText('Chegou só o fone.');
  expect(screen.queryByText(/Chamado sobre o pedido/)).not.toBeInTheDocument();
  expect(screen.getByText('Ajuda pelo app')).toBeInTheDocument();
});

test('ninguém assumiu ainda: faixa de recebido', async () => {
  renderThread();
  expect(screen.getByText('Recebemos seu chamado')).toBeInTheDocument();
});

test('resposta do suporte chega sozinha (socket), só desta conversa e sem duplicar', async () => {
  renderThread();
  await screen.findByText('Chegou só o fone.');
  const msg = { _id: 'm2', conversationId: 'c1', senderId: 's1', senderName: 'Marina', text: 'Já vi o pedido.', createdAt: '2026-10-03T14:55:00' };
  act(() => { handlers['chat:new_message'](msg); handlers['chat:new_message'](msg); });
  act(() => { handlers['chat:new_message']({ ...msg, _id: 'm3', conversationId: 'outra', text: 'De outra conversa' }); });
  expect(screen.getAllByText('Já vi o pedido.')).toHaveLength(1);
  expect(screen.queryByText('De outra conversa')).not.toBeInTheDocument();
});

test('alguém assumiu com a tela aberta: vira "Em atendimento" e some a faixa', async () => {
  renderThread();
  await screen.findByText('Chegou só o fone.');
  act(() => { handlers['support:ticket_updated']({ ticketId: 't1', conversationId: 'c1', status: 'em_atendimento', attendantName: 'Marina Rocha' }); });
  expect(screen.getByText('Em atendimento')).toBeInTheDocument();
  expect(screen.queryByText('Recebemos seu chamado')).not.toBeInTheDocument();
  expect(screen.getByText(/Marina, do suporte, entrou na conversa/)).toBeInTheDocument();
});

test('resolvido com a tela aberta: troca o campo pelo bloco e o rascunho vai para o chamado novo', async () => {
  const onNewTicket = jest.fn();
  renderThread(ticket(), { onNewTicket });
  await screen.findByText('Chegou só o fone.');
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'E o cabo?' } });
  act(() => { handlers['support:ticket_resolved']({ ticketId: 't1', conversationId: 'c1' }); });
  expect(screen.queryByLabelText('Mensagem')).not.toBeInTheDocument();
  expect(screen.getByText('Resolvido')).toBeInTheDocument();
  expect(screen.getByText(/Este chamado foi encerrado em \d{2}\/\d{2} às \d{2}:\d{2}\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir outro chamado' }));
  expect(onNewTicket).toHaveBeenCalledWith('E o cabo?');
});

test('chamado que já veio resolvido mostra a data de encerramento', async () => {
  renderThread(ticket({ status: 'resolvido', resolvedAt: '2026-10-03T15:10:00' }));
  expect(await screen.findByText('Este chamado foi encerrado em 03/10 às 15:10.')).toBeInTheDocument();
});

test('enviar para chamado encerrado (403): vira o bloco de resolvido, sem perder o texto', async () => {
  post.mockRejectedValueOnce({ response: { status: 403, data: { error: 'Este atendimento foi encerrado' } } });
  const onNewTicket = jest.fn();
  renderThread(ticket(), { onNewTicket });
  await screen.findByText('Chegou só o fone.');
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Oi?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  expect(await screen.findByRole('button', { name: 'Abrir outro chamado' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir outro chamado' }));
  expect(onNewTicket).toHaveBeenCalledWith('Oi?');
});

test('mensagem que não saiu: bolha com "Tentar de novo" que reenvia', async () => {
  post.mockRejectedValueOnce(new Error('rede'));
  post.mockResolvedValueOnce({ data: { _id: 'm9', conversationId: 'c1', senderId: 'u1', text: 'Alô', createdAt: '2026-10-03T15:00:00' } });
  renderThread();
  await screen.findByText('Chegou só o fone.');
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Alô' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  const retry = await screen.findByRole('button', { name: 'Tentar de novo' });
  expect(screen.getByText('Alô')).toBeInTheDocument();
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument());
  expect(post).toHaveBeenLastCalledWith('/chat/conversations/c1/messages', { text: 'Alô' });
  expect(screen.getAllByText('Alô')).toHaveLength(1);
});
