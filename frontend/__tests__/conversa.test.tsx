import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

let mockQuery: any = { id: 'o1' };
let mockDelivery: any = { status: 'picked', motoboyId: 'm1', motoboyObj: { _id: 'm1', name: 'Carlos Silva' } };
const setMessages = jest.fn();
const joinConversation = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', id: 'u1', name: 'Ana' } }) }));
jest.mock('../hooks/useChat', () => ({ useChat: () => ({ messages: [{ _id: 'm-1', senderId: 'm1', text: 'Já peguei seu pedido', createdAt: '2026-10-10T14:22:00' }], setMessages, joinConversation, leaveConversation: jest.fn(), isConnected: true }) }));
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => ({ order: { _id: 'o1', storeId: 's1', storeName: 'Eletro Center', status: 'pago' }, delivery: mockDelivery, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock;

import ConversaPage from '../pages/pedido/[id]/conversa';
import { pedidoConversaHref } from '../lib/routes';

beforeEach(() => {
  mockQuery = { id: 'o1' }; mockDelivery = { status: 'picked', motoboyId: 'm1', motoboyObj: { _id: 'm1', name: 'Carlos Silva' } };
  get.mockReset(); post.mockReset(); setMessages.mockClear(); joinConversation.mockClear();
  post.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/messages') ? { _id: 'novo', text: 'x' } : { _id: url.includes('pre-purchase') ? 'conv-loja' : 'conv-mb' } }));
  get.mockResolvedValue({ data: { messages: [] } });
});

test('pedidoConversaHref', () => {
  expect(pedidoConversaHref('o1')).toBe('/pedido/o1/conversa');
  expect(pedidoConversaHref('o1', 'loja')).toBe('/pedido/o1/conversa?com=loja');
});

test('abre a conversa com o entregador do pedido e mostra as mensagens', async () => {
  render(<ConversaPage />);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'motoboy_cliente', otherParticipantId: 'm1', orderId: 'o1' }));
  await waitFor(() => expect(joinConversation).toHaveBeenCalledWith('conv-mb'));
  expect(screen.getByText('Já peguei seu pedido')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Carlos' })).toHaveAttribute('aria-selected', 'true');
});

test('resposta rápida e campo enviam a mensagem', async () => {
  render(<ConversaPage />);
  await waitFor(() => expect(joinConversation).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Pode deixar na portaria' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations/conv-mb/messages', { text: 'Pode deixar na portaria' }));
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Interfone 42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations/conv-mb/messages', { text: 'Interfone 42' }));
});

test('sem entregador ainda: só a aba da loja, pela conversa de pré-compra', async () => {
  mockDelivery = { status: 'pending' };
  render(<ConversaPage />);
  expect(screen.queryByRole('tab', { name: 'Carlos' })).toBeNull();
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations/pre-purchase', { storeId: 's1', conversationType: 'user' }));
});
