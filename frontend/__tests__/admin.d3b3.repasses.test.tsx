/**
 * D3b-3 · P4.6 — Repasses: "já feito" do lote só por 409 PAYOUT_NOT_PENDING com currentStatus
 * released|requested|paid (em andamento e bloqueado são falha, o texto antigo não vale mais), resposta incerta
 * nunca reenviada, filtro "Incertos" (?uncertain=1), "Resolver" (Foi pago / Não foi enviado), bloqueio com
 * motivo de 3 a 500 e 409 em bloquear/desbloquear.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminPayoutsPage from '../pages/admin/payouts';
import {
  PAYOUT_STALE_RELEASING_MS, isPayoutAlreadyReleased, isPayoutResolvable, payoutStatus, type Payout,
} from '../components/admin/dinheiro/payoutRules';
import { resetViewport } from './helpers/viewport';

const mockToast = jest.fn();
let mockCan: (p: string) => boolean = () => true;

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/payouts', asPath: '/admin/payouts' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' },
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const at = '2026-10-16T13:53:00Z';
const P1 = {
  _id: 'p1', recipientType: 'store', recipientId: 's1', orderId: 'ord000004812', amount: 206.91, status: 'pending', createdAt: at,
  recipient: { id: 's1', name: 'Eletro Center', type: 'store' },
};
const P2 = { ...P1, _id: 'p2', recipientType: 'motoboy', recipientId: 'm1', amount: 9.92, recipient: { id: 'm1', name: 'Carlos Lima', type: 'motoboy' } };
const P5 = { ...P1, _id: 'p5', recipientType: 'motoboy', amount: 11.44, recipient: { id: 'm3', name: 'Júlia Santos', type: 'motoboy' } };
const BLOQUEADO = { ...P1, _id: 'p3', blocked: true, blockReason: 'Fraude', recipient: { id: 's2', name: 'Pet Bom', type: 'store' } };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();
const INCERTO = {
  ...P1, _id: 'p7', status: 'releasing', amount: 84.15, uncertainAt: minutesAgo(3), updatedAt: minutesAgo(3),
  recipient: { id: 's3', name: 'Papelaria Central', type: 'store' },
};
const PARADO = {
  ...P1, _id: 'p9', status: 'releasing', amount: 158.4, uncertainAt: null, updatedAt: minutesAgo(11),
  recipient: { id: 's5', name: 'Tabacaria do Centro', type: 'store' },
};
const EM_VOO = {
  ...P1, _id: 'p8', status: 'releasing', amount: 312.3, uncertainAt: null, updatedAt: minutesAgo(1),
  recipient: { id: 's4', name: 'Mercado Bom', type: 'store' },
};

const notPending = (currentStatus: string, blocked = false) => ({
  response: { status: 409, data: { error: `Repasse não está pendente (status atual: ${currentStatus})`, code: 'PAYOUT_NOT_PENDING', currentStatus, blocked } },
});

let payoutsNow: any[];
let uncertainNow: any[];
beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockCan = () => true;
  payoutsNow = [P1, P2, BLOQUEADO];
  uncertainNow = [INCERTO, PARADO];
  get.mockImplementation((url: string) => {
    if (url.startsWith('/payouts/admin?uncertain=1')) return Promise.resolve({ data: { payouts: uncertainNow, total: uncertainNow.length } });
    if (url.startsWith('/payouts/admin?')) return Promise.resolve({ data: { payouts: payoutsNow, total: payoutsNow.length } });
    if (url === '/payouts/admin/obligations') return Promise.resolve({ data: { pendingObligations: 301 } });
    if (url === '/payouts/admin/config') return Promise.resolve({ data: { autoApprovePayouts: false } });
    if (url.startsWith('/invoices/by-order/')) return Promise.resolve({ data: null });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  post.mockResolvedValue({ data: { message: 'ok' } });
});
afterEach(() => resetViewport());

const released = () => post.mock.calls.filter(([u]) => /\/release$/.test(u)).map(([u]) => u.split('/')[3]);
const selectAllAndConfirm = (n: number) => {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
  const bar = screen.getByRole('region', { name: 'Itens selecionados' });
  const label = `Liberar ${n} ${n === 1 ? 'repasse' : 'repasses'}`;
  fireEvent.click(within(bar).getByRole('button', { name: label }));
  fireEvent.click(within(screen.getByRole('dialog', { name: label })).getByRole('button', { name: label }));
};
const showUncertain = async () => {
  fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'incertos' } });
  await waitFor(() => expect(get).toHaveBeenCalledWith('/payouts/admin?uncertain=1&limit=100'));
  return screen.findByText('Papelaria Central');
};

describe('regras (payoutRules)', () => {
  it.each(['released', 'requested', 'paid'])('409 PAYOUT_NOT_PENDING com %s e não bloqueado é "já feito"', (st) => {
    expect(isPayoutAlreadyReleased(notPending(st))).toBe(true);
  });
  it('em andamento, bloqueado, cancelado, outro código, o texto antigo em 400/502 e rede não são', () => {
    expect(isPayoutAlreadyReleased(notPending('releasing'))).toBe(false);
    expect(isPayoutAlreadyReleased(notPending('pending', true))).toBe(false);
    expect(isPayoutAlreadyReleased(notPending('released', true))).toBe(false);
    expect(isPayoutAlreadyReleased(notPending('cancelled'))).toBe(false);
    expect(isPayoutAlreadyReleased({ response: { status: 409, data: { code: 'PAYOUT_NOT_BLOCKED', currentStatus: 'released' } } })).toBe(false);
    expect(isPayoutAlreadyReleased({ response: { status: 502, data: { error: 'Payout não está pendente (status atual: released)' } } })).toBe(false);
    expect(isPayoutAlreadyReleased({ response: { status: 400, data: { error: 'Payout não está pendente (status atual: released)' } } })).toBe(false);
    expect(isPayoutAlreadyReleased(new Error('Network Error'))).toBe(false);
  });
  it('resolvível: releasing com uncertainAt, ou parado há mais de 10 min', () => {
    const now = Date.parse('2026-10-16T15:00:00Z');
    const base = P1 as unknown as Payout;
    expect(isPayoutResolvable({ ...base, status: 'releasing', uncertainAt: '2026-10-16T14:59:00Z' }, now)).toBe(true);
    expect(isPayoutResolvable({ ...base, status: 'releasing', updatedAt: new Date(now - PAYOUT_STALE_RELEASING_MS - 1000).toISOString() }, now)).toBe(true);
    expect(isPayoutResolvable({ ...base, status: 'releasing', updatedAt: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(isPayoutResolvable({ ...base, status: 'releasing' }, now)).toBe(false);
    expect(isPayoutResolvable({ ...base, status: 'pending', uncertainAt: '2026-10-16T14:59:00Z' }, now)).toBe(false);
  });
  it('situação de quem está em liberação', () => {
    const now = Date.parse('2026-10-16T15:00:00Z');
    const base = P1 as unknown as Payout;
    expect(payoutStatus({ ...base, status: 'releasing', uncertainAt: '2026-10-16T14:59:00Z' }, now))
      .toEqual({ label: 'Incerto — conferir no painel Asaas', tone: 'bad' });
    expect(payoutStatus({ ...base, status: 'releasing', updatedAt: '2026-10-16T14:00:00Z' }, now))
      .toEqual({ label: 'Parado em liberação — conferir no painel Asaas', tone: 'bad' });
    expect(payoutStatus({ ...base, status: 'releasing', updatedAt: '2026-10-16T14:59:30Z' }, now))
      .toEqual({ label: 'Em liberação', tone: 'info' });
  });
});

describe('lote de liberação', () => {
  it('só released/requested/paid contam como feito; em andamento e bloqueado falham com mensagem própria', async () => {
    payoutsNow = [P1, P2, P5];
    post.mockImplementation((url: string) => {
      const id = url.split('/')[3];
      if (id === 'p1') return Promise.reject(notPending('released'));
      if (id === 'p2') return Promise.reject(notPending('releasing'));
      return Promise.reject(notPending('pending', true));
    });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(3);
    expect(await screen.findByText('Lote: 1 concluído, 2 com erro')).toBeInTheDocument();
    expect(screen.getByText('Carlos Lima: Em andamento: a transferência deste repasse já começou. Se não concluir, ele aparece em "Incertos".')).toBeInTheDocument();
    expect(screen.getByText('Júlia Santos: Bloqueado: desbloqueie antes de liberar.')).toBeInTheDocument();
  });

  it('o texto antigo "(status atual: released)" em 502 não conta mais como feito', async () => {
    payoutsNow = [P1];
    post.mockRejectedValue({ response: { status: 502, data: { error: 'Transferência no Asaas não concluída: Payout não está pendente (status atual: released)' } } });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(1);
    expect(await screen.findByText('Lote: 0 concluídos, 1 com erro')).toBeInTheDocument();
  });

  it('resposta incerta: falha com o aviso de "Resolver" e o "Tentar de novo" não reenvia (o repasse ficou em liberação)', async () => {
    payoutsNow = [P1];
    post.mockImplementation(() => {
      payoutsNow = [{ ...P1, status: 'releasing', uncertainAt: minutesAgo(0), updatedAt: minutesAgo(0) }];
      return Promise.reject({
        response: { status: 502, data: { error: 'Resposta incerta do Asaas', code: 'PAYOUT_TRANSFER_UNCERTAIN', currentStatus: 'releasing' } },
      });
    });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(1);
    expect(await screen.findByText('Eletro Center: O Asaas não confirmou a transferência: o repasse ficou incerto. Confira no painel do Asaas e use "Resolver".')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    expect(await screen.findByText('1 repasse já não estava aguardando liberação e não foi reenviado.')).toBeInTheDocument();
    expect(released()).toEqual(['p1']);
  });

  it('recusa do Asaas: falha com o texto do servidor e avisa que voltou para a fila', async () => {
    payoutsNow = [P1];
    post.mockRejectedValue({
      response: { status: 502, data: { error: 'Transferência no Asaas não concluída: conta inválida', code: 'PAYOUT_TRANSFER_REFUSED', currentStatus: 'pending' } },
    });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(1);
    expect(await screen.findByText('Eletro Center: Transferência no Asaas não concluída: conta inválida. O repasse voltou para "Aguardando liberação".')).toBeInTheDocument();
  });
});

describe('Incertos e Resolver', () => {
  it('filtro "Incertos" lê ?uncertain=1 e mostra a situação de cada um com "Resolver"', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    const outros = screen.getByRole('region', { name: 'Outros repasses' });
    expect(within(outros).getByText('Incerto — conferir no painel Asaas')).toBeInTheDocument();
    expect(within(outros).getByText('Parado em liberação — conferir no painel Asaas')).toBeInTheDocument();
    expect(within(outros).getAllByRole('button', { name: 'Resolver' })).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Aguardando liberação' })).toBeNull();
  });

  it('em liberação há pouco: "Em liberação", sem "Resolver"', async () => {
    payoutsNow = [P1, EM_VOO];
    render(<AdminPayoutsPage />);
    const outros = await screen.findByRole('region', { name: 'Outros repasses' });
    expect(within(outros).getByText('Mercado Bom')).toBeInTheDocument();
    expect(within(outros).getByText('Em liberação')).toBeInTheDocument();
    expect(within(outros).queryByRole('button', { name: 'Resolver' })).toBeNull();
  });

  it('"Foi pago" com o nº da transferência e nota: POST resolve-uncertain, aviso e lista relida', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    fireEvent.click(within(screen.getByRole('region', { name: 'Outros repasses' })).getAllByRole('button', { name: 'Resolver' })[0]);
    const sheet = screen.getByRole('dialog', { name: 'Resolver repasse incerto' });
    const ok = within(sheet).getByRole('button', { name: 'Confirmar resolução' });
    expect(ok).toBeDisabled();
    fireEvent.click(within(sheet).getByRole('radio', { name: /Foi pago/ }));
    fireEvent.change(within(sheet).getByLabelText('Nº da transferência no Asaas (opcional)'), { target: { value: ' tra_123 ' } });
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'curta' } });
    expect(ok).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'Conferido no painel: saiu às 14h' } });
    expect(ok).toBeEnabled();
    const reads = get.mock.calls.length;
    fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/payouts/admin/p7/resolve-uncertain', {
      outcome: 'released', note: 'Conferido no painel: saiu às 14h', asaasTransferId: 'tra_123',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Repasse resolvido: pago.', 'success');
    expect(get.mock.calls.length).toBeGreaterThan(reads);
  });

  it('"Não foi enviado": só outcome e nota (o nº da transferência não vai)', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    fireEvent.click(within(screen.getByRole('region', { name: 'Outros repasses' })).getAllByRole('button', { name: 'Resolver' })[1]);
    const sheet = screen.getByRole('dialog', { name: 'Resolver repasse incerto' });
    fireEvent.click(within(sheet).getByRole('radio', { name: /Foi pago/ }));
    fireEvent.change(within(sheet).getByLabelText('Nº da transferência no Asaas (opcional)'), { target: { value: 'tra_999' } });
    fireEvent.click(within(sheet).getByRole('radio', { name: /Não foi enviado/ }));
    expect(within(sheet).queryByLabelText('Nº da transferência no Asaas (opcional)')).toBeNull();
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'Nada no extrato do Asaas' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar resolução' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/payouts/admin/p9/resolve-uncertain', {
      outcome: 'not_sent', note: 'Nada no extrato do Asaas',
    }));
    expect(mockToast).toHaveBeenCalledWith('Repasse resolvido: voltou para "Aguardando liberação".', 'success');
  });

  it('409 PAYOUT_NOT_RESOLVABLE: aviso na folha, que fica aberta, e a lista é relida', async () => {
    post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'x', code: 'PAYOUT_NOT_RESOLVABLE', currentStatus: 'released', uncertainAt: null } },
    });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    fireEvent.click(within(screen.getByRole('region', { name: 'Outros repasses' })).getAllByRole('button', { name: 'Resolver' })[0]);
    const sheet = screen.getByRole('dialog', { name: 'Resolver repasse incerto' });
    fireEvent.click(within(sheet).getByRole('radio', { name: /Não foi enviado/ }));
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'Nada no extrato do Asaas' } });
    const reads = get.mock.calls.filter(([u]) => String(u).startsWith('/payouts/admin?uncertain=1')).length;
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar resolução' }));
    expect(await within(sheet).findByText('Este repasse já foi resolvido (ou não está mais incerto). A lista foi atualizada.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Resolver repasse incerto' })).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.filter(([u]) => String(u).startsWith('/payouts/admin?uncertain=1')).length).toBeGreaterThan(reads));
  });

  it('sem payout:release: vê os incertos, mas sem "Resolver"', async () => {
    mockCan = (p) => p === 'payout:view';
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    expect(screen.queryByRole('button', { name: 'Resolver' })).toBeNull();
  });

  it('detalhe do repasse incerto mostra desde quando', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    fireEvent.click(screen.getByRole('button', { name: /^Papelaria Central/ }));
    const sheet = screen.getByRole('dialog', { name: 'Detalhes do repasse' });
    expect(within(sheet).getByText('Incerto desde')).toBeInTheDocument();
  });
});

describe('bloquear e desbloquear', () => {
  const openBlock = async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]);
    return screen.getByRole('dialog', { name: 'Bloquear repasse' });
  };

  it('motivo de 3 a 500 caracteres', async () => {
    const sheet = await openBlock();
    const send = within(sheet).getByRole('button', { name: 'Bloquear repasse' });
    const field = within(sheet).getByLabelText('Motivo do bloqueio');
    fireEvent.change(field, { target: { value: 'ab' } });
    expect(send).toBeDisabled();
    fireEvent.change(field, { target: { value: 'abc' } });
    expect(send).toBeEnabled();
    expect(within(sheet).getByText('De 3 a 500 caracteres (3/500).')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'x'.repeat(501) } });
    expect(send).toBeDisabled();
  });

  it('409 PAYOUT_NOT_PENDING ao bloquear: mensagem e lista relida', async () => {
    post.mockRejectedValueOnce(notPending('released'));
    const sheet = await openBlock();
    fireEvent.change(within(sheet).getByLabelText('Motivo do bloqueio'), { target: { value: 'Fraude confirmada' } });
    const reads = get.mock.calls.length;
    fireEvent.click(within(sheet).getByRole('button', { name: 'Bloquear repasse' }));
    expect(await within(sheet).findByText('Este repasse já foi liberado.')).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(reads));
  });

  it('409 PAYOUT_NOT_BLOCKED ao desbloquear: mensagem e lista relida', async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'x', code: 'PAYOUT_NOT_BLOCKED', currentStatus: 'pending', blocked: false } } });
    render(<AdminPayoutsPage />);
    await screen.findByText('Pet Bom');
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    const sheet = screen.getByRole('dialog', { name: 'Desbloquear repasse' });
    const reads = get.mock.calls.length;
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar desbloqueio' })); });
    expect(await within(sheet).findByText('Este repasse já não está bloqueado.')).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(reads));
  });
});

describe('pré-voo e rulings da P4.6', () => {
  it('F12: bloquear um repasse que outra pessoa já bloqueou mostra a mensagem do bloqueio (não a do lote) e relê', async () => {
    post.mockRejectedValueOnce(notPending('pending', true));
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]);
    const sheet = screen.getByRole('dialog', { name: 'Bloquear repasse' });
    fireEvent.change(within(sheet).getByLabelText('Motivo do bloqueio'), { target: { value: 'Fraude confirmada' } });
    const reads = get.mock.calls.length;
    fireEvent.click(within(sheet).getByRole('button', { name: 'Bloquear repasse' }));
    expect(await within(sheet).findByText('Este repasse já está bloqueado. A lista foi atualizada.')).toBeInTheDocument();
    expect(within(sheet).queryByText('Bloqueado: desbloqueie antes de liberar.')).toBeNull();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(reads));
  });

  it('Resolver com id devolvido pelo Asaas: aviso forte antes de "Não foi enviado"', async () => {
    uncertainNow = [{ ...INCERTO, gatewayTransferId: 'tra_777' }, PARADO];
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    fireEvent.click(within(screen.getByRole('region', { name: 'Outros repasses' })).getAllByRole('button', { name: 'Resolver' })[0]);
    const sheet = screen.getByRole('dialog', { name: 'Resolver repasse incerto' });
    expect(within(sheet).getByText('O Asaas devolveu o id tra_777: confira no Asaas se a transferência falhou antes de marcar "Não foi enviado".'))
      .toBeInTheDocument();
  });

  it('Resolver sem id do Asaas (ou com id manual_resolve_*): sem o aviso do id', async () => {
    uncertainNow = [{ ...INCERTO, gatewayTransferId: 'manual_resolve_p7' }, PARADO];
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    await showUncertain();
    const outros = screen.getByRole('region', { name: 'Outros repasses' });
    fireEvent.click(within(outros).getAllByRole('button', { name: 'Resolver' })[0]);
    let sheet = screen.getByRole('dialog', { name: 'Resolver repasse incerto' });
    expect(within(sheet).queryByText(/O Asaas devolveu o id/)).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(outros).getAllByRole('button', { name: 'Resolver' })[1]);
    sheet = screen.getByRole('dialog', { name: 'Resolver repasse incerto' });
    expect(within(sheet).queryByText(/O Asaas devolveu o id/)).toBeNull();
  });

  it('detalhe: id manual_resolve_* não aparece como nº de transferência do Asaas', async () => {
    payoutsNow = [P1, { ...P1, _id: 'p6', status: 'released', gatewayProvider: 'asaas', gatewayTransferId: 'manual_resolve_p6', recipient: { id: 's6', name: 'Bazar Novo', type: 'store' } }];
    render(<AdminPayoutsPage />);
    await screen.findByText('Bazar Novo');
    fireEvent.click(screen.getByRole('button', { name: /^Bazar Novo/ }));
    const sheet = screen.getByRole('dialog', { name: 'Detalhes do repasse' });
    expect(within(sheet).queryByText('manual_resolve_p6')).toBeNull();
    expect(within(sheet).getByText('Resolvido à mão (sem nº do Asaas)')).toBeInTheDocument();
  });

  it('detalhe: id real do Asaas continua aparecendo', async () => {
    payoutsNow = [P1, { ...P1, _id: 'p6', status: 'released', gatewayProvider: 'asaas', gatewayTransferId: 'tra_abc', recipient: { id: 's6', name: 'Bazar Novo', type: 'store' } }];
    render(<AdminPayoutsPage />);
    await screen.findByText('Bazar Novo');
    fireEvent.click(screen.getByRole('button', { name: /^Bazar Novo/ }));
    expect(within(screen.getByRole('dialog', { name: 'Detalhes do repasse' })).getByText('tra_abc')).toBeInTheDocument();
  });
});
