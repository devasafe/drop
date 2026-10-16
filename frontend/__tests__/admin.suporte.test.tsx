import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
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
jest.mock('../components/ChatPanel', () => ({
  __esModule: true,
  default: (p: { isFinalized?: boolean; finalizedMessage?: string; onSendMessage: (t: string) => void }) => (
    <div data-testid="chat-panel" data-finalized={String(!!p.isFinalized)}>
      {p.isFinalized && <p>{p.finalizedMessage}</p>}
      <button type="button" onClick={() => p.onSendMessage('Oi, Lia')}>Enviar mensagem de teste</button>
    </div>
  ),
}));

const T1 = {
  _id: 'aaaaaaaat0000001', conversationId: 'cv1', subject: 'Meu pedido chegou sem o cabo', status: 'aberto', category: 'clientes',
  openedBy: { userId: 'c9', name: 'Lia Prado', role: 'cliente' }, assignedTo: [], createdAt: '2026-10-03T14:51:00.000Z',
};
const T2 = {
  _id: 'bbbbbbbbt0000002', conversationId: 'cv2', subject: 'Não caiu o repasse de ontem', status: 'em_atendimento', category: 'motoboys',
  openedBy: { userId: 'm4', name: 'Rafael Torres', role: 'motoboy' }, assignedTo: [{ userId: 'u1', name: 'Marina Rocha' }], createdAt: '2026-10-03T15:10:00.000Z',
};
const T3 = {
  _id: 'cccccccct0000003', conversationId: 'cv3', subject: 'Como coloco minha chave Asaas?', status: 'resolvido', category: 'lojistas',
  openedBy: { userId: 'l2', name: 'Bella Livros', role: 'lojista' }, assignedTo: [{ userId: 'u7', name: 'Ana' }], createdAt: '2026-10-02T10:00:00.000Z',
};
const CONVS = (n = 1, total = 1) => ({
  conversations: Array.from({ length: n }, (_, i) => ({
    _id: `k${i + 1}`, type: 'loja_cliente', supportStatus: undefined,
    participant1: { userId: 'p1', name: `Caio Melo ${i + 1}`, role: 'cliente' },
    participant2: { userId: 'p2', name: 'Pet Bom', role: 'lojista' },
    lastMessage: { text: 'Cadê meu pedido?' }, updatedAt: '2026-10-14T12:00:00.000Z',
  })),
  total,
});
const MSGS = { messages: [
  { _id: 'm1', senderId: 'p1', text: 'Cadê meu pedido?', createdAt: '2026-10-14T12:00:00.000Z' },
  { _id: 'm2', senderId: 'p2', text: 'Já saiu para entrega', createdAt: '2026-10-14T12:05:00.000Z' },
] };

let convs = CONVS();
const ticketCalls = () => (api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/support/tickets');
const GERENTE_SUPORTE = adminAuth('gerente_geral', ['support:attend']);

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockQuery = {};
  convs = CONVS();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/support/tickets') return Promise.resolve({ data: [T1, T2, T3] });
    if (url.startsWith('/chat/conversations/')) return Promise.resolve({ data: [] });
    if (url === '/chat/admin/conversations') return Promise.resolve({ data: convs });
    if (url.startsWith('/chat/admin/conversations/')) return Promise.resolve({ data: MSGS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  (api.put as jest.Mock).mockResolvedValue({ data: { ticket: { ...T1, status: 'em_atendimento', assignedTo: [{ userId: 'u1', name: 'Marina Rocha' }] } } });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
  (api.delete as jest.Mock).mockResolvedValue({ data: {} });
});

const filters = () => within(screen.getByRole('group', { name: 'Filtro do suporte' })).getAllByRole('button').map((b) => b.textContent);
const open = async (subject: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name: subject }));
  return screen.findByRole('region', { name: 'Conversa' });
};

describe('portão e filtros por permissão (D1)', () => {
  it('CEO: filtros de chamados e "Conversas entre usuários"; começa em Todos', async () => {
    renderAdminPage(<AdminSuporte />);
    expect(screen.getByRole('heading', { name: 'Suporte' })).toBeInTheDocument();
    expect(filters()).toEqual(['Todos', 'Abertos', 'Em atendimento', 'Comigo', 'Resolvidos', 'Conversas entre usuários']);
    await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ });
    expect(api.get).toHaveBeenCalledWith('/support/tickets', { params: {} });
  });

  it('só support:attend: sem o filtro de conversas', async () => {
    renderAdminPage(<AdminSuporte />, GERENTE_SUPORTE);
    await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ });
    expect(filters()).not.toContain('Conversas entre usuários');
  });

  it('só conversations:view_all: abre nas conversas e não lê chamados', async () => {
    renderAdminPage(<AdminSuporte />, adminAuth('gerente_lojistas', ['conversations:view_all']));
    expect(filters()).toEqual(['Conversas entre usuários']);
    await screen.findAllByRole('button', { name: /Caio Melo 1/ });
    expect(ticketCalls()).toHaveLength(0);
  });

  it('?filtro=conversas abre direto nas conversas', async () => {
    mockQuery = { filtro: 'conversas' };
    renderAdminPage(<AdminSuporte />);
    await screen.findAllByRole('button', { name: /Caio Melo 1/ });
    expect(ticketCalls()).toHaveLength(0);
  });

  it('sem nenhuma das duas: sai da tela e nada é lido', async () => {
    renderAdminPage(<AdminSuporte />, adminAuth('marketing', ['theme:edit']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('chamados', () => {
  it('"Comigo" filtra na tela, sem nova leitura', async () => {
    renderAdminPage(<AdminSuporte />);
    await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ });
    fireEvent.click(screen.getByRole('button', { name: 'Comigo' }));
    expect(screen.getByRole('button', { name: /Não caiu o repasse de ontem/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Meu pedido chegou sem o cabo/ })).toBeNull();
    expect(ticketCalls()).toHaveLength(1);
  });

  it('três colunas: lista, conversa e contexto da pessoa', async () => {
    renderAdminPage(<AdminSuporte />);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    expect(within(conv).getByText('#T0000001')).toBeInTheDocument();
    const ctx = screen.getByRole('complementary', { name: 'Contexto' });
    expect(within(ctx).getByText('Lia Prado')).toBeInTheDocument();
    expect(within(ctx).getByText('Cliente')).toBeInTheDocument();
    expect(within(ctx).getByText('Clientes')).toBeInTheDocument();
    expect(within(ctx).getByText('Ninguém ainda')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chamados' })).toBeInTheDocument();
    expect(screen.getByTestId('chat-panel')).toHaveAttribute('data-finalized', 'true');
    expect(screen.getByText('Assuma o chamado para poder responder.')).toBeInTheDocument();
    expect(mockChat.joinConversation).toHaveBeenCalledWith('cv1');
  });

  it('Assumir libera a resposta', async () => {
    renderAdminPage(<AdminSuporte />);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    fireEvent.click(within(conv).getByRole('button', { name: 'Assumir' }));
    await waitFor(() => expect(screen.getByTestId('chat-panel')).toHaveAttribute('data-finalized', 'false'));
    expect(within(conv).queryByRole('button', { name: 'Assumir' })).toBeNull();
    expect(within(screen.getByRole('complementary', { name: 'Contexto' })).getByText('Marina Rocha')).toBeInTheDocument();
  });

  it('Assumir com erro vira toast', async () => {
    (api.put as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Você não pode assumir tickets de outra categoria' } } });
    renderAdminPage(<AdminSuporte />, GERENTE_SUPORTE);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    fireEvent.click(within(conv).getByRole('button', { name: 'Assumir' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Você não tem permissão para isso', 'error'));
  });

  it('"Excluir" só aparece para o CEO (como hoje)', async () => {
    renderAdminPage(<AdminSuporte />, GERENTE_SUPORTE);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    expect(within(conv).queryByRole('button', { name: 'Excluir' })).toBeNull();
    expect(within(conv).getByRole('button', { name: 'Marcar resolvido' })).toBeInTheDocument();
  });

  it('Marcar resolvido: AdminSheet; erro do servidor fica dentro', async () => {
    (api.put as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Apenas a equipe de suporte pode finalizar atendimentos' } } });
    renderAdminPage(<AdminSuporte />);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    fireEvent.click(within(conv).getByRole('button', { name: 'Marcar resolvido' }));
    const dialog = screen.getByRole('dialog', { name: 'Marcar o chamado como resolvido?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar resolvido' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  });

  it('Marcar resolvido: chamado fica resolvido, sem ações e com a resposta fechada', async () => {
    (api.put as jest.Mock).mockResolvedValue({ data: {} });
    renderAdminPage(<AdminSuporte />);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    fireEvent.click(within(conv).getByRole('button', { name: 'Marcar resolvido' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marcar resolvido' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Chamado resolvido', 'success'));
    expect(api.put).toHaveBeenCalledWith('/support/tickets/aaaaaaaat0000001/resolve');
    expect(within(conv).queryByRole('button', { name: 'Marcar resolvido' })).toBeNull();
    expect(screen.getByText('Atendimento encerrado.')).toBeInTheDocument();
  });

  it('CEO exclui pela sheet e a conversa fecha', async () => {
    renderAdminPage(<AdminSuporte />);
    const conv = await open(/Meu pedido chegou sem o cabo/);
    fireEvent.click(within(conv).getByRole('button', { name: 'Excluir' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Excluir este chamado?' })).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/support/tickets/aaaaaaaat0000001'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull());
  });

  it('mensagem que não foi enviada vira toast', async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 500, data: { error: 'Erro ao enviar' } } });
    renderAdminPage(<AdminSuporte />);
    await open(/Não caiu o repasse de ontem/);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem de teste' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Erro ao enviar', 'error'));
  });

  it('lista ilegível: "Tentar de novo" (nunca "nenhum chamado")', async () => {
    (api.get as jest.Mock).mockImplementationOnce(() => Promise.reject({ response: { status: 500, data: { error: 'Erro interno' } } }));
    renderAdminPage(<AdminSuporte />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ })).toBeInTheDocument();
  });

  it('conversa ilegível: aviso com "Tentar de novo"', async () => {
    let fail = true;
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/support/tickets') return Promise.resolve({ data: [T1] });
      if (url === '/chat/conversations/cv1/messages') {
        if (fail) { fail = false; return Promise.reject({ response: { status: 500, data: { error: 'Erro ao buscar mensagens' } } }); }
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error(url));
    });
    renderAdminPage(<AdminSuporte />);
    await open(/Meu pedido chegou sem o cabo/);
    expect(await screen.findByText('Erro ao buscar mensagens')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText('Erro ao buscar mensagens')).toBeNull());
  });

  it('celular: lista → conversa → voltar à lista', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminSuporte />);
    fireEvent.click(await screen.findByRole('button', { name: /Meu pedido chegou sem o cabo/ }));
    expect(screen.queryByRole('region', { name: 'Chamados' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Conversa' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Contexto' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à lista' }));
    expect(screen.getByRole('region', { name: 'Chamados' })).toBeInTheDocument();
    expect(mockChat.leaveConversation).toHaveBeenCalledWith('cv1');
  });
});

describe('conversas entre usuários', () => {
  beforeEach(() => { mockQuery = { filtro: 'conversas' }; });

  it('somente leitura: mensagens, contexto e sem campo de resposta', async () => {
    renderAdminPage(<AdminSuporte />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Caio Melo 1/ }))[0]);
    expect(await screen.findByText('Já saiu para entrega')).toBeInTheDocument();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
    expect(screen.queryByTestId('chat-panel')).toBeNull();
    const ctx = screen.getByRole('complementary', { name: 'Contexto' });
    expect(within(ctx).getByText('Loja × Cliente')).toBeInTheDocument();
    expect(within(ctx).getByText('Pet Bom · Lojista')).toBeInTheDocument();
  });

  it('paginação pede a próxima página', async () => {
    convs = CONVS(25, 30);
    renderAdminPage(<AdminSuporte />);
    await screen.findAllByRole('button', { name: /Caio Melo 1/ });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/chat/admin/conversations', { params: { page: 2, limit: 25 } }));
  });

  it('lista ilegível: "Tentar de novo"', async () => {
    (api.get as jest.Mock).mockImplementationOnce(() => Promise.reject({ response: { status: 500, data: { error: 'Erro interno' } } }));
    renderAdminPage(<AdminSuporte />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect((await screen.findAllByRole('button', { name: /Caio Melo 1/ })).length).toBeGreaterThan(0);
  });

  it('conversa ilegível: aviso com "Tentar de novo" (antes: conversa vazia)', async () => {
    let fail = true;
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/chat/admin/conversations') return Promise.resolve({ data: convs });
      if (url === '/chat/admin/conversations/k1/messages') {
        if (fail) { fail = false; return Promise.reject({ response: { status: 500, data: { error: 'Erro ao buscar mensagens' } } }); }
        return Promise.resolve({ data: MSGS });
      }
      return Promise.reject(new Error(url));
    });
    renderAdminPage(<AdminSuporte />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Caio Melo 1/ }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao buscar mensagens');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Já saiu para entrega')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('celular: lista → conversa → voltar', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminSuporte />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Caio Melo 1/ }))[0]);
    expect(await screen.findByText('Já saiu para entrega')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à lista' }));
    expect(screen.getByRole('region', { name: 'Conversas entre usuários' })).toBeInTheDocument();
  });
});
