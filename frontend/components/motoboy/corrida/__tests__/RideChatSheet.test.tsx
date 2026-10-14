import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const handlers: Record<string, (d: any) => void> = {};
const mockEmit = jest.fn();
// K19: objeto fixo do módulo, com identidade estável entre renders.
const mockSocket = {
  on: (ev: string, fn: any) => { handlers[ev] = fn; return () => undefined; },
  emit: (...a: any[]) => mockEmit(...a),
  isConnected: true,
  onReconnect: () => () => undefined,
};
jest.mock('../../../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
const mockUser = { id: 'm1', _id: 'm1', name: 'Carlos' };
jest.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
import { RideChatSheet } from '../RideChatSheet';
import { QUICK_REPLIES } from '../../../../lib/chatQuickReplies';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  post.mockImplementation((url: string, body: any) => {
    if (url === '/chat/conversations') return Promise.resolve({ data: { _id: 'cv1' } });
    if (url === '/chat/conversations/cv1/messages') return Promise.resolve({ data: { message: { _id: 'm9', conversationId: 'cv1', text: body.text, senderId: 'm1', createdAt: '2026-10-14T12:31:00Z' } } });
    return Promise.reject(new Error('n/a'));
  });
  get.mockResolvedValue({ data: { messages: [{ _id: 'm1', conversationId: 'cv1', text: 'Já está separado', senderId: 'u-loja', createdAt: '2026-10-14T12:30:00Z' }] } });
});

const props = { open: true, onClose: jest.fn(), deliveryId: 'd1', orderId: 'o1' };

test('retirada: abre a conversa loja↔motoboy pelo id da loja, ligada à corrida', async () => {
  render(<RideChatSheet {...props} kind="loja_motoboy" otherParticipantId="s1" otherName="Eletro Center" />);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'loja_motoboy', otherParticipantId: 's1', orderId: 'o1', deliveryId: 'd1' }));
  expect(await screen.findByText('Já está separado')).toBeInTheDocument();
  expect(screen.getByText('Conversa com Eletro Center')).toBeInTheDocument();
  expect(mockEmit).toHaveBeenCalledWith('chat:join', { conversationId: 'cv1', userId: 'm1' });
});

test('entrega: abre a conversa motoboy↔cliente pelo id do cliente', async () => {
  render(<RideChatSheet {...props} kind="motoboy_cliente" otherParticipantId="c1" otherName="Ana" />);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'motoboy_cliente', otherParticipantId: 'c1', orderId: 'o1', deliveryId: 'd1' }));
  expect(screen.getByRole('button', { name: QUICK_REPLIES.motoboyCliente[0] })).toBeInTheDocument();
});

test('resposta pronta envia na hora e aparece no fio', async () => {
  render(<RideChatSheet {...props} kind="loja_motoboy" otherParticipantId="s1" otherName="Eletro Center" />);
  await screen.findByText('Já está separado');
  fireEvent.click(screen.getByRole('button', { name: 'Cheguei na loja' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations/cv1/messages', { text: 'Cheguei na loja' }));
  expect(await screen.findByText('Cheguei na loja', { selector: 'p' })).toBeInTheDocument();
});

test('composer envia o texto digitado', async () => {
  render(<RideChatSheet {...props} kind="motoboy_cliente" otherParticipantId="c1" otherName="Ana" />);
  await screen.findByText('Já está separado');
  fireEvent.change(screen.getByPlaceholderText('Sua mensagem...'), { target: { value: 'Estou no portão' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations/cv1/messages', { text: 'Estou no portão' }));
});

test('mensagem de outra conversa não entra no fio', async () => {
  render(<RideChatSheet {...props} kind="loja_motoboy" otherParticipantId="s1" otherName="Eletro Center" />);
  await screen.findByText('Já está separado');
  act(() => {
    handlers['chat:new_message']({ _id: 'x1', conversationId: 'outra', text: 'Segredo de outra corrida', senderId: 'u9', createdAt: '2026-10-14T12:40:00Z' });
    handlers['chat:new_message']({ _id: 'x2', conversationId: 'cv1', text: 'Pode subir', senderId: 'u-loja', createdAt: '2026-10-14T12:41:00Z' });
  });
  expect(await screen.findByText('Pode subir')).toBeInTheDocument();
  expect(screen.queryByText('Segredo de outra corrida')).not.toBeInTheDocument();
});

test('falha ao abrir mostra "Tentar de novo" e tenta de novo', async () => {
  post.mockRejectedValueOnce(new Error('x'));
  render(<RideChatSheet {...props} kind="loja_motoboy" otherParticipantId="s1" otherName="Eletro Center" />);
  expect(await screen.findByText('Não abrimos a conversa')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Já está separado')).toBeInTheDocument();
});

test('sem o id do outro lado não chama a API', async () => {
  render(<RideChatSheet {...props} kind="motoboy_cliente" otherParticipantId="" otherName="Ana" />);
  expect(await screen.findByText('Não abrimos a conversa')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

test('fechar sai da conversa', async () => {
  const { rerender } = render(<RideChatSheet {...props} kind="loja_motoboy" otherParticipantId="s1" otherName="Eletro Center" />);
  await screen.findByText('Já está separado');
  rerender(<RideChatSheet {...props} open={false} kind="loja_motoboy" otherParticipantId="s1" otherName="Eletro Center" />);
  expect(mockEmit).toHaveBeenCalledWith('chat:leave', { conversationId: 'cv1', userId: 'm1' });
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'RideChatSheet.module.css'), 'utf8'))).toEqual([]);
});
