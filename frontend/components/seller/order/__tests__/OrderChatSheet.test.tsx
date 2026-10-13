import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderChatSheet } from '../OrderChatSheet';
import { QUICK_REPLIES } from '../../../../lib/chatQuickReplies';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => undefined, emit: jest.fn(), isConnected: true }) }));
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const order = { _id: 'ord000004819', customerId: 'c1', customerName: 'Ana Souza', status: 'aguardando_motoboy' };

beforeEach(() => {
  jest.clearAllMocks();
  post.mockImplementation((url: string, body: any) => {
    if (url === '/chat/conversations') return Promise.resolve({ data: { _id: 'cv1' } });
    if (url === '/chat/conversations/cv1/messages') return Promise.resolve({ data: { message: { _id: 'm9', text: body.text, senderId: 'u1', createdAt: '2026-10-12T12:31:00Z' } } });
    return Promise.reject(new Error('n/a'));
  });
  get.mockResolvedValue({ data: { messages: [{ _id: 'm1', text: 'O petisco tem de frango?', senderId: 'c1', createdAt: '2026-10-12T12:39:00Z' }] } });
});

test('abre a conversa loja↔cliente do pedido, como o modal antigo', async () => {
  render(<OrderChatSheet open onClose={jest.fn()} order={order} currentUserId="u1" />);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'loja_cliente', otherParticipantId: 'c1', orderId: 'ord000004819' }));
  expect(await screen.findByText('O petisco tem de frango?')).toBeInTheDocument();
  expect(screen.getByText('Não peça pagamento fora do app nem passe o PIN de entrega por aqui.')).toBeInTheDocument();
});

test('resposta pronta envia na hora', async () => {
  render(<OrderChatSheet open onClose={jest.fn()} order={order} currentUserId="u1" />);
  await screen.findByText('O petisco tem de frango?');
  fireEvent.click(screen.getByRole('button', { name: 'Já está saindo' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations/cv1/messages', { text: 'Já está saindo' }));
  expect(await screen.findByText('Já está saindo', { selector: 'p' })).toBeInTheDocument();
});

test('respostas prontas da loja existem', () => {
  expect(QUICK_REPLIES.lojista).toEqual(['Já está saindo', 'Acabou um item, posso trocar?', 'Obrigado!']);
});

test('falha ao abrir mostra "Tentar de novo"', async () => {
  post.mockRejectedValue(new Error('x'));
  render(<OrderChatSheet open onClose={jest.fn()} order={order} currentUserId="u1" />);
  expect(await screen.findByText('Não abrimos a conversa')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'OrderChatSheet.module.css'), 'utf8'))).toEqual([]);
});
