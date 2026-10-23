/**
 * D3b-2a · P3.4 — ficha da loja (spec 6, 7 e 11): resumo com o dono (link para a ficha da pessoa), pausa do DROP
 * com motivo, autor e data, números de 30 dias, avaliações, recebimento, plano, pedidos e histórico. "Pausar loja"
 * (motivo obrigatório) e "Liberar loja" (só pausada pelo DROP), conforme `can`; 409 ALREADY_PAUSED na folha e a
 * ficha relê; nota no topo; releitura que falha; barra fixa a 393 px.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminLojaFichaPage from '../pages/admin/lojas/[id]';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { id: 's1' }, isReady: true, pathname: '/admin/lojas/[id]', asPath: '/admin/lojas/s1' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const DETAIL = {
  profile: {
    id: 's1', name: 'Eletro Center', cnpj: '12.345.678/0001-90', owner: { id: 'p9', name: 'Renato Nunes' }, city: 'São Paulo',
    situation: 'open', adminPause: null,
  },
  stats30d: { orders: 120, cancelledByStore: 3, rating: 4.7 },
  nearbyCouriers: { online: 3, free: 1 },
  nearbyRadiusKm: 12,
  reviews: [{ orderId: 'o1', rating: 5, comment: 'Chegou rápido', createdAt: '2026-10-19T12:00:00.000Z' }],
  receiving: { status: 'pending', detail: 'Conta Asaas em análise' },
  plan: { plan: null, mode: 'saas', saas: { status: 'trialing', trialEndsAt: '2026-11-01T12:00:00.000Z', paidUntil: null, cancelledAt: null } },
  orders: [{ id: 'ord00000d4e5f6', status: 'cancelado', total: 99.9, createdAt: '2026-10-18T12:00:00.000Z' }],
  timeline: { items: [], nextCursor: null },
  can: { pause: true, unpause: false, note: true, extendTrial: false, cancelSaas: false },
};
const PAUSADA = {
  ...DETAIL,
  profile: {
    ...DETAIL.profile, situation: 'admin_paused',
    adminPause: { at: '2026-10-20T12:00:00.000Z', reason: 'Documentos vencidos', by: { id: 'u1', name: 'Marina Rocha' } },
  },
  timeline: { items: [{ id: 't1', type: 'store_pause', reason: 'Documentos vencidos', meta: null, createdAt: '2026-10-20T12:00:00.000Z', actor: { id: 'u1', name: 'Marina Rocha', role: 'ceo' } }], nextCursor: null },
  can: { pause: false, unpause: true, note: true, extendTrial: false, cancelSaas: false },
};

const renderFicha = (auth = adminAuth('ceo')) => renderAdminPage(<AdminLojaFichaPage />, auth);
const region = (name: string) => screen.getByRole('region', { name });
const acoes = () => screen.getByRole('group', { name: 'Ações da loja' });

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: DETAIL });
  post.mockResolvedValue({ data: {} });
});
afterEach(() => resetViewport());

describe('ficha da loja · blocos', () => {
  it('lê GET /admin/stores/:id e mostra os blocos da spec 6', async () => {
    renderFicha();
    const resumo = await screen.findByRole('region', { name: 'Loja' });
    expect(get).toHaveBeenCalledWith('/admin/stores/s1');
    expect(screen.getByRole('heading', { level: 1, name: 'Eletro Center' })).toBeInTheDocument();
    expect(within(resumo).getByText('12.345.678/0001-90')).toBeInTheDocument();
    expect(within(resumo).getByRole('link', { name: 'Renato Nunes' })).toHaveAttribute('href', '/admin/users/p9');
    expect(within(resumo).getByText('São Paulo')).toBeInTheDocument();
    expect(within(resumo).getByText('Aberta')).toBeInTheDocument();

    const numeros = region('Últimos 30 dias');
    expect(within(numeros).getByText('120')).toBeInTheDocument();
    expect(within(numeros).getByText('3')).toBeInTheDocument();
    expect(within(numeros).getByText('4,7')).toBeInTheDocument();

    expect(within(region('Avaliações')).getByText('Chegou rápido')).toBeInTheDocument();
    expect(within(region('Recebimento')).getByText('Pendente')).toBeInTheDocument();
    expect(within(region('Recebimento')).getByText('Conta Asaas em análise')).toBeInTheDocument();
    const plano = region('Plano');
    expect(within(plano).getByText('SaaS')).toBeInTheDocument();
    expect(within(plano).getByText('Em teste')).toBeInTheDocument();
    expect(within(plano).getByText('01/11/2026')).toBeInTheDocument();
    expect(within(region('Pedidos')).getByRole('link', { name: '#d4e5f6' })).toHaveAttribute('href', '/admin/pedidos/ord00000d4e5f6');
    expect(within(region('Pedidos')).getByText('Cancelado')).toBeInTheDocument();
    expect(within(region('Histórico')).getByText('Nada no histórico ainda.')).toBeInTheDocument();
  });

  it('pausada pelo DROP: aviso com motivo, autor e data', async () => {
    get.mockResolvedValue({ data: PAUSADA });
    renderFicha();
    const resumo = await screen.findByRole('region', { name: 'Loja' });
    expect(within(resumo).getByText('Pausada pelo DROP', { selector: 'span' })).toBeInTheDocument();
    expect(within(resumo).getByText('Motivo: Documentos vencidos · por Marina Rocha · em 20/10/2026')).toBeInTheDocument();
  });

  it('recebimento sem detalhe (só o CEO recebe o erro do Asaas): só o selo, sem texto inventado', async () => {
    get.mockResolvedValue({ data: { ...DETAIL, receiving: { status: 'problem', detail: null } } });
    renderFicha(adminAuth('gerente_lojistas', ['store:view_all']));
    const receb = await screen.findByRole('region', { name: 'Recebimento' });
    expect(within(receb).getByText('Com problema')).toBeInTheDocument();
    expect(receb.textContent).toBe('RecebimentoCom problema');
  });

  it('sem user:view_all o dono aparece sem link; sem operation:view o pedido também', async () => {
    renderFicha(adminAuth('gerente_lojistas', ['store:view_all', 'store:edit']));
    const resumo = await screen.findByRole('region', { name: 'Loja' });
    expect(within(resumo).getByText('Renato Nunes')).toBeInTheDocument();
    expect(within(resumo).queryByRole('link', { name: 'Renato Nunes' })).toBeNull();
    expect(within(region('Pedidos')).queryByRole('link')).toBeNull();
  });
});

describe('ficha da loja · Pausar e Liberar', () => {
  it('Pausar: motivo obrigatório, POST, toast e releitura (a loja vira pausada pelo DROP)', async () => {
    get.mockResolvedValueOnce({ data: DETAIL }).mockResolvedValueOnce({ data: PAUSADA });
    renderFicha();
    await screen.findByRole('region', { name: 'Loja' });
    expect(within(acoes()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pausar loja']);
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Pausar loja' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pausar loja' });
    expect(within(dialog).getByText(/Os pedidos em andamento continuam/)).toBeInTheDocument();
    const ok = within(dialog).getByRole('button', { name: 'Pausar loja' });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: ' Documentos vencidos ' } });
    fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/stores/s1/pause', { reason: 'Documentos vencidos' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Loja pausada pelo DROP.', 'success');
    expect(await screen.findByText('Motivo: Documentos vencidos · por Marina Rocha · em 20/10/2026')).toBeInTheDocument();
    expect(within(acoes()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Liberar loja']);
  });

  it('Liberar: motivo opcional (vazio vai como {}) e releitura', async () => {
    get.mockResolvedValue({ data: PAUSADA });
    renderFicha();
    await screen.findByRole('region', { name: 'Loja' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Liberar loja' }));
    const dialog = await screen.findByRole('dialog', { name: 'Liberar loja' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Liberar loja' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/stores/s1/unpause', {}));
    expect(mockToast).toHaveBeenCalledWith('Loja liberada.', 'success');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('409 ALREADY_PAUSED: a mensagem fica na folha e a ficha relê', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { error: 'A loja já está pausada pelo DROP.', code: 'ALREADY_PAUSED' } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Loja' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Pausar loja' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pausar loja' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Documentos vencidos' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pausar loja' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A loja já está pausada pelo DROP. A ficha foi atualizada.');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('sem store:edit (can falso): nenhuma ação', async () => {
    get.mockResolvedValue({ data: { ...DETAIL, can: { pause: false, unpause: false, note: true, extendTrial: false, cancelSaas: false } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Loja' });
    expect(screen.queryByRole('group', { name: 'Ações da loja' })).toBeNull();
  });
});

describe('ficha da loja · notas, leitura e 393 px', () => {
  it('nota no topo: POST /admin/stores/:id/notes e a ficha relê', async () => {
    renderFicha();
    const hist = await screen.findByRole('region', { name: 'Histórico' });
    fireEvent.change(within(hist).getByLabelText('Nota interna'), { target: { value: 'Dono pediu prazo' } });
    fireEvent.click(within(hist).getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/stores/s1/notes', { text: 'Dono pediu prazo' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('1ª leitura que falha: "Loja não encontrada." e "Tentar de novo"', async () => {
    get.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' } } }).mockResolvedValueOnce({ data: DETAIL });
    renderFicha();
    expect(await screen.findByRole('alert')).toHaveTextContent('Loja não encontrada.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Loja' })).toBeInTheDocument();
  });

  it('releitura que falha: a última leitura fica, com o aviso', async () => {
    get.mockResolvedValueOnce({ data: DETAIL }).mockRejectedValueOnce(new Error('x'));
    renderFicha();
    const hist = await screen.findByRole('region', { name: 'Histórico' });
    fireEvent.change(within(hist).getByLabelText('Nota interna'), { target: { value: 'Dono pediu prazo' } });
    fireEvent.click(within(hist).getByRole('button', { name: 'Salvar nota' }));
    expect(await screen.findByText('Não deu para atualizar. Mostrando a última leitura.')).toBeInTheDocument();
    expect(region('Loja')).toBeInTheDocument();
  });

  it('393 px: ações numa barra fixa, com botões de toque', async () => {
    setViewportWidth(393);
    renderFicha();
    await screen.findByRole('region', { name: 'Loja' });
    expect(acoes().className).toContain('actionBar');
    expect(within(acoes()).getByRole('button', { name: 'Pausar loja' }).className).toContain('touch');
  });
});
