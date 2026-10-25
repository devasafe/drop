/**
 * Caracterização do Suporte em /admin/suporte (escrita contra as páginas antigas e mantida na nova):
 * - chamados;
 * - conversas entre usuários, no filtro ?filtro=conversas (a página antiga de conversas saiu na P5.2 e hoje é
 *   um redirect para este filtro).
 */
import type { ComponentType } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { confirmIfAsked, renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import AdminSuporte from '../pages/admin/suporte';

let mockQuery: Record<string, string> = {};
const mockRouter = { pathname: '/admin/suporte', asPath: '/admin/suporte', push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ ...mockRouter, query: mockQuery }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));
const mockChat = {
  messages: [], setMessages: jest.fn(), typingUsers: [], setUserTyping: jest.fn(), markAsRead: jest.fn(),
  joinConversation: jest.fn(), leaveConversation: jest.fn(), isConnected: true, socket: null,
};
jest.mock('../hooks/useChat', () => ({ __esModule: true, default: () => mockChat, useChat: () => mockChat }));
// O chat do chamado agora é o TicketChat (DS v2); mesmo contrato de props do antigo ChatPanel.
jest.mock('../components/admin/suporte/TicketChat', () => ({
  __esModule: true,
  TicketChat: (p: { onSendMessage: (t: string) => void }) => (
    <div data-testid="chat-panel">
      <button type="button" onClick={() => p.onSendMessage('Oi, Lia')}>Enviar mensagem de teste</button>
    </div>
  ),
}));

const TICKETS = [{
  _id: 't1', conversationId: 'cv1', subject: 'Meu pedido chegou sem o cabo', status: 'aberto', category: 'clientes',
  openedBy: { userId: 'c9', name: 'Lia Prado', role: 'cliente' }, assignedTo: [], createdAt: '2026-10-03T14:51:00.000Z',
}];
const CONVS = {
  conversations: [{
    _id: 'k1', type: 'loja_cliente',
    participant1: { userId: 'p1', name: 'Caio Melo', role: 'cliente' },
    participant2: { userId: 'p2', name: 'Pet Bom', role: 'lojista' },
    lastMessage: { text: 'Cadê meu pedido?' }, updatedAt: '2026-10-14T12:00:00.000Z',
  }],
  total: 1,
};
const MSGS = { messages: [{ _id: 'm1', senderId: 'p2', text: 'Já saiu para entrega', createdAt: '2026-10-14T12:05:00.000Z' }] };

// F7: o jsdom não tem scrollIntoView (a página antiga de conversas o chamava; o stub fica por segurança).
beforeAll(() => { Element.prototype.scrollIntoView = jest.fn(); });

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  mockQuery = {};
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/support/tickets') return Promise.resolve({ data: TICKETS });
    if (url === '/chat/conversations/cv1/messages') return Promise.resolve({ data: [] });
    if (url === '/chat/admin/conversations') return Promise.resolve({ data: CONVS });
    if (url === '/chat/admin/conversations/k1/messages') return Promise.resolve({ data: MSGS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  (api.put as jest.Mock).mockResolvedValue({ data: { ticket: { ...TICKETS[0], status: 'em_atendimento', assignedTo: [{ userId: 'u1', name: 'Marina Rocha' }] } } });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
  (api.delete as jest.Mock).mockResolvedValue({ data: {} });
});

describe('chamados (/admin/suporte)', () => {
  const openTicket = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/chat/conversations/cv1/messages'));
  };

  it('lista com params vazios e filtra por situação', async () => {
    renderAdminPage(<AdminSuporte />);
    await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ });
    expect(api.get).toHaveBeenCalledWith('/support/tickets', { params: { scope: 'staff' } });
    fireEvent.click(screen.getByRole('button', { name: /^Abertos?$/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/support/tickets', { params: { scope: 'staff', status: 'aberto' } }));
  });

  it('abrir e assumir: lê a conversa, PUT …/assign e relê a lista', async () => {
    renderAdminPage(<AdminSuporte />);
    await openTicket();
    fireEvent.click(screen.getByRole('button', { name: 'Assumir' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/support/tickets/t1/assign'));
    await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/support/tickets').length).toBe(2));
  });

  it('responder: POST da mensagem na conversa do chamado', async () => {
    renderAdminPage(<AdminSuporte />);
    await openTicket();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem de teste' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/chat/conversations/cv1/messages', { text: 'Oi, Lia' }));
  });

  it('marcar resolvido: PUT …/resolve', async () => {
    renderAdminPage(<AdminSuporte />);
    await openTicket();
    fireEvent.click(screen.getByRole('button', { name: /^(Resolver|Marcar resolvido)$/ }));
    await confirmIfAsked('Marcar resolvido');
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/support/tickets/t1/resolve'));
  });

  it('CEO exclui: DELETE /support/tickets/:id', async () => {
    renderAdminPage(<AdminSuporte />);
    await openTicket();
    fireEvent.click(screen.getByRole('button', { name: /^(Apagar|Excluir)$/ }));
    await confirmIfAsked('Excluir');
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/support/tickets/t1'));
  });
});

const CONVERSAS_PAGES: Array<[string, ComponentType, Record<string, string>]> = [
  ['suporte?filtro=conversas (nova)', AdminSuporte, { filtro: 'conversas' }],
];

describe.each(CONVERSAS_PAGES)('conversas entre usuários — %s', (_name, Page, query) => {
  beforeEach(() => { mockQuery = query; });

  it('lista com página e limite', async () => {
    renderAdminPage(<Page />);
    await screen.findAllByRole('button', { name: /Caio/ });
    expect(api.get).toHaveBeenCalledWith('/chat/admin/conversations', { params: { page: 1, limit: 25 } });
  });

  it('filtra por tipo e busca por nome', async () => {
    renderAdminPage(<Page />);
    await screen.findAllByRole('button', { name: /Caio/ });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'loja_cliente' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/chat/admin/conversations', { params: { page: 1, limit: 25, type: 'loja_cliente' } }));
    const search = screen.getByPlaceholderText('Buscar por nome...');
    fireEvent.change(search, { target: { value: 'caio' } });
    fireEvent.submit(search.closest('form') as HTMLFormElement);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/chat/admin/conversations', {
      params: { page: 1, limit: 25, type: 'loja_cliente', search: 'caio' },
    }));
  });

  it('abrir: lê as mensagens da conversa (somente leitura)', async () => {
    renderAdminPage(<Page />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Caio/ }))[0]);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/chat/admin/conversations/k1/messages'));
    expect(await screen.findByText('Já saiu para entrega')).toBeInTheDocument();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
  });
});
