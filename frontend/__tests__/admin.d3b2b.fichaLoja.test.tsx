/**
 * D3b-2b · P3.4 — ficha da loja (spec 9):
 * - "Estender teste" (7, 14 ou 30 dias com a data nova, motivo obrigatório) e "Cancelar mensalidade" (motivo e o nome
 *   da loja digitado), conforme `can` e o status da mensalidade;
 * - 409 NOT_TRIALING/ALREADY_CANCELLED na folha e a ficha relê; 502 do Asaas na folha e nada relê;
 * - o plano cancelado diz até quando a loja vende;
 * - "Conta Asaas · histórico" só quando o servidor manda (CEO);
 * - botões de toque a 393 px.
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

// coveredUntil vem do servidor (P2.5): 02/11 02:59:59.999Z é 01/11 23:59 em Brasília.
const SAAS = { status: 'trialing', trialEndsAt: '2030-11-01T12:00:00.000Z', paidUntil: null, cancelledAt: null, coveredUntil: '2030-11-02T02:59:59.999Z' };
const DETAIL = {
  profile: {
    id: 's1', name: 'Eletro Center', cnpj: '12.345.678/0001-90', owner: { id: 'p9', name: 'Renato Nunes' }, city: 'São Paulo',
    situation: 'open', adminPause: null,
  },
  stats30d: { orders: 120, cancelledByStore: 3, rating: 4.7 },
  nearbyCouriers: { online: 3, free: 1 },
  nearbyRadiusKm: 12,
  reviews: [],
  receiving: { status: 'ok', detail: null },
  plan: { plan: null, mode: 'saas', saas: SAAS },
  orders: [],
  timeline: { items: [], nextCursor: null },
  can: { pause: false, unpause: false, note: true, extendTrial: true, cancelSaas: true },
};
const withSaas = (saas: Record<string, unknown>, can: Record<string, boolean> = {}) => ({
  ...DETAIL, plan: { ...DETAIL.plan, saas: { ...SAAS, ...saas } }, can: { ...DETAIL.can, ...can },
});
const HIST = {
  audits: [
    { action: 'replace', apiKeyLast4: '9f3a', actor: { id: 'p9', name: 'Renato Nunes' }, createdAt: '2026-10-01T12:00:00.000Z' },
    { action: 'disconnect', apiKeyLast4: null, actor: { id: 'x9', name: null }, createdAt: '2026-10-02T12:00:00.000Z' },
  ],
  consent: { termsVersion: '2026-09', ip: '200.1.2.3', acceptedAt: '2026-09-30T12:00:00.000Z', actorRole: 'lojista' },
};

const renderFicha = () => renderAdminPage(<AdminLojaFichaPage />, adminAuth('ceo'));
const region = (name: string) => screen.getByRole('region', { name });
const acoes = () => screen.getByRole('group', { name: 'Ações da loja' });
const loja = () => screen.findByRole('region', { name: 'Loja' });

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: DETAIL });
  post.mockResolvedValue({ data: {} });
});
afterEach(() => resetViewport());

describe('ações da mensalidade conforme `can` e o status', () => {
  it('em teste, com plan:manage: "Estender teste" e "Cancelar mensalidade"', async () => {
    renderFicha();
    await loja();
    expect(within(acoes()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Estender teste', 'Cancelar mensalidade']);
  });

  it('em dia: só "Cancelar mensalidade"; já cancelada: nenhuma; sem plan:manage (can falso): nenhuma', async () => {
    get.mockResolvedValueOnce({ data: withSaas({ status: 'active', paidUntil: '2030-12-01T12:00:00.000Z' }) });
    const a = renderFicha();
    await loja();
    expect(within(acoes()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar mensalidade']);
    a.unmount();

    get.mockResolvedValueOnce({ data: withSaas({ status: 'cancelled', cancelledAt: '2026-10-21T12:00:00.000Z' }) });
    const b = renderFicha();
    await loja();
    expect(screen.queryByRole('group', { name: 'Ações da loja' })).toBeNull();
    b.unmount();

    get.mockResolvedValueOnce({ data: withSaas({}, { extendTrial: false, cancelSaas: false }) });
    renderFicha();
    await loja();
    expect(screen.queryByRole('group', { name: 'Ações da loja' })).toBeNull();
  });
});

describe('Estender teste', () => {
  it('escolhe 7, 14 ou 30 (com a data nova); motivo obrigatório; POST, aviso com a data e a ficha relida', async () => {
    const novo = { ...SAAS, trialEndsAt: '2030-11-15T12:00:00.000Z' };
    get.mockResolvedValueOnce({ data: DETAIL }).mockResolvedValueOnce({ data: withSaas(novo) });
    post.mockResolvedValue({ data: { saas: novo } });
    renderFicha();
    await loja();
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Estender teste' }));
    const dialog = await screen.findByRole('dialog', { name: 'Estender teste' });
    expect(within(dialog).getByText(
      'O teste vai até 01/11/2030. Os dias contam a partir do fim do teste (ou de hoje, se ele já acabou).',
    )).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['7', '14', '30']);
    expect(within(dialog).getByText('Teste até 15/11/2030')).toBeInTheDocument();
    const ok = within(dialog).getByRole('button', { name: 'Estender teste' });
    expect(ok).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('radio', { name: /^14 dias/ }));
    expect(ok).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: ' Lojista pediu mais prazo ' } });
    expect(ok).toBeEnabled();
    fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/stores/s1/saas/extend-trial', { days: 14, reason: 'Lojista pediu mais prazo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Teste estendido até 15/11/2030.', 'success');
    expect(await within(region('Plano')).findByText('15/11/2030')).toBeInTheDocument();
  });

  it('502 do Asaas: mensagem na folha e nada relê; 409 NOT_TRIALING: mensagem na folha e a ficha relê', async () => {
    post
      .mockRejectedValueOnce({ response: { status: 502, data: { error: 'Falha no Asaas', code: 'ASAAS_UPDATE_FAILED' } } })
      .mockRejectedValueOnce({ response: { status: 409, data: { error: 'Não está em teste', code: 'NOT_TRIALING' } } });
    renderFicha();
    await loja();
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Estender teste' }));
    const dialog = await screen.findByRole('dialog', { name: 'Estender teste' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /^7 dias/ }));
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Lojista pediu mais prazo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Estender teste' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'O Asaas não aceitou a nova data da cobrança. Nada mudou: tente de novo em alguns minutos.',
    );
    expect(get).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Estender teste' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('A loja não está mais em teste. A ficha foi atualizada.'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe('Cancelar mensalidade', () => {
  it('motivo e o nome da loja liberam o botão; POST, aviso e a ficha relida mostra até quando vende', async () => {
    const cancelada = withSaas({ status: 'cancelled', cancelledAt: '2026-10-21T12:00:00.000Z' });
    get.mockResolvedValueOnce({ data: DETAIL }).mockResolvedValueOnce({ data: cancelada });
    renderFicha();
    await loja();
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Cancelar mensalidade' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar mensalidade' });
    expect(within(dialog).getByText(
      'A loja continua vendendo até 01/11/2030 e depois fica pausada pelo DROP com o motivo “Mensalidade cancelada”.',
    )).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    const ok = within(dialog).getByRole('button', { name: 'Cancelar mensalidade' });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Lojista encerrou as vendas' } });
    expect(ok).toBeDisabled();
    const nome = within(dialog).getByLabelText('Digite o nome da loja para confirmar');
    fireEvent.change(nome, { target: { value: 'Eletro' } });
    expect(ok).toBeDisabled();
    fireEvent.change(nome, { target: { value: ' eletro center ' } });
    expect(ok).toBeEnabled();
    fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/stores/s1/saas/cancel', { reason: 'Lojista encerrou as vendas' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Mensalidade cancelada.', 'success');
    expect(await within(region('Plano')).findByText('Cancelada · vende até 01/11')).toBeInTheDocument();
    expect(within(region('Plano')).getByText('21/10/2026')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ações da loja' })).toBeNull();
  });

  it('409 ALREADY_CANCELLED: mensagem na folha e a ficha relê', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { error: 'Já cancelada', code: 'ALREADY_CANCELLED' } } });
    renderFicha();
    await loja();
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Cancelar mensalidade' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar mensalidade' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Lojista encerrou as vendas' } });
    fireEvent.change(within(dialog).getByLabelText('Digite o nome da loja para confirmar'), { target: { value: 'Eletro Center' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar mensalidade' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A mensalidade já estava cancelada. A ficha foi atualizada.');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('período pago já acabou: a folha diz que a pausa vem na próxima verificação', async () => {
    get.mockResolvedValue({ data: withSaas({
      status: 'past_due', trialEndsAt: '2026-01-01T12:00:00.000Z', paidUntil: '2026-02-01T00:00:00.000Z', coveredUntil: '2026-02-02T02:59:59.999Z',
    }) });
    renderFicha();
    await loja();
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Cancelar mensalidade' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar mensalidade' });
    expect(within(dialog).getByText(
      'O período pago já acabou: a loja fica pausada pelo DROP com o motivo “Mensalidade cancelada” na próxima verificação automática.',
    )).toBeInTheDocument();
  });
});

describe('plano e histórico Asaas', () => {
  it('cancelada depois do período: "vendeu até" e a data do cancelamento', async () => {
    get.mockResolvedValue({ data: withSaas({
      status: 'cancelled', paidUntil: '2026-02-01T00:00:00.000Z', cancelledAt: '2026-01-20T12:00:00.000Z', coveredUntil: '2026-02-02T02:59:59.999Z',
    }) });
    renderFicha();
    await loja();
    const plano = region('Plano');
    expect(within(plano).getByText('Cancelada · vendeu até 01/02')).toBeInTheDocument();
    expect(within(plano).getByText('Cancelada em')).toBeInTheDocument();
    expect(within(plano).getByText('20/01/2026')).toBeInTheDocument();
  });

  it('"Conta Asaas · histórico" só quando o servidor manda (CEO): alterações e o aceite do termo', async () => {
    get.mockResolvedValue({ data: { ...DETAIL, asaasHistory: HIST } });
    renderFicha();
    const hist = await screen.findByRole('region', { name: 'Conta Asaas · histórico' });
    expect(within(hist).getByText('Termo 2026-09 aceito em 30/09/2026 às 09:00 · IP 200.1.2.3 · pelo lojista')).toBeInTheDocument();
    expect(within(hist).getByText('Chave trocada · chave ••••9f3a')).toBeInTheDocument();
    expect(within(hist).getByText('Renato Nunes · 01/10/2026 às 09:00')).toBeInTheDocument();
    expect(within(hist).getByText('Conta desconectada')).toBeInTheDocument();
    expect(within(hist).getByText('Pessoa removida · 02/10/2026 às 09:00')).toBeInTheDocument();
  });

  it('sem o bloco na resposta (não é CEO): nada de histórico Asaas; vazio: diz que não há nada', async () => {
    const a = renderFicha();
    await loja();
    expect(screen.queryByRole('region', { name: 'Conta Asaas · histórico' })).toBeNull();
    a.unmount();
    get.mockResolvedValue({ data: { ...DETAIL, asaasHistory: { audits: [], consent: null } } });
    renderFicha();
    const hist = await screen.findByRole('region', { name: 'Conta Asaas · histórico' });
    expect(within(hist).getByText('Termo de uso da conta Asaas ainda não aceito.')).toBeInTheDocument();
    expect(within(hist).getByText('Nenhuma alteração na conta Asaas.')).toBeInTheDocument();
  });

  it('393 px: os botões novos ficam na barra fixa, com toque', async () => {
    setViewportWidth(393);
    renderFicha();
    await loja();
    expect(acoes().className).toContain('actionBar');
    within(acoes()).getAllByRole('button').forEach((b) => expect(b.className).toContain('touch'));
  });
});
