/**
 * D3b-2a · P3.1 — peças sem tela de Pessoas e Lojas (lib/adminAccounts): chamadas às rotas do plano mestre,
 * checagem do formato (fail closed, bloco ausente ou null = não mandado), papéis, rótulos, textos curtos e as
 * mensagens dos códigos novos (o código vem de `code`).
 */
import api from '../lib/api';
import {
  accountErrorCode, accountErrorMessage, actionLabel, addStoreNote, addUserNote, adminPauseNote, blockNote, blockUser,
  disconnectUser, fetchStoreDetail, fetchStoreTimeline, fetchStores, fetchUserDetail, fetchUserTimeline, fetchUsers,
  flattenAccountError, forgiveDebt, isAccountConflict, isStoreDetail, isStoreListResponse, isTimelineResponse,
  isUserDetail, isUserListResponse, lastSeenLabel, noteIsValid, pauseStore, phoneLabel, planLabel, rateLabel,
  ratingLabel, reasonIsValid, rolesSavedText, rolesText, saveUserRoles, timelineActor, timelineDetail, unblockUser,
  unpauseStore, withCliente,
} from '../lib/adminAccounts';

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const put = api.put as jest.Mock;
const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

const NOW = Date.parse('2026-10-20T15:00:00.000Z');

const TL_ITEM = {
  id: 't1', type: 'note', reason: 'Ligou reclamando', meta: null, createdAt: '2026-10-20T13:00:00.000Z',
  actor: { id: 'a1', name: 'Marina Rocha', role: 'ceo' },
};
const USER_ITEM = {
  id: 'p1', name: 'Ana Souza', email: 'ana@x.com', roles: ['cliente'], status: 'active', blockReason: null,
  verification: 'ok', lastSeenAt: '2026-10-20T14:50:00.000Z', orders90d: 4, pendingDebt: null,
};
const USER_DETAIL = {
  profile: {
    id: 'p1', name: 'Ana Souza', email: 'ana@x.com', phoneLast4: '4321', roles: ['cliente', 'motoboy'],
    status: 'blocked', block: { reason: 'Fraude no cupom', at: '2026-10-19T12:00:00.000Z', by: { id: 'a1', name: 'Marina Rocha' } },
    createdAt: '2026-01-02T12:00:00.000Z', lastSeenAt: null,
  },
  verification: [{ kind: 'courier', status: 'rejected', reason: 'CNH ilegível', at: '2026-02-02T12:00:00.000Z' }],
  orders: [{ id: 'o1', status: 'entregue', total: 58.9, createdAt: '2026-10-19T12:00:00.000Z', store: { id: 's1', name: 'Sabor da Vila' } }],
  debts: [{
    id: 'd1', amount: 12.5, status: 'pending', reason: 'Cancelamento depois do aceite', sourceOrderId: 'o9',
    createdAt: '2026-10-10T12:00:00.000Z', forgivenAt: null,
  }],
  motoboy: {
    cnh: '12345678900', plate: 'ABC1D23', hasPixKey: true,
    deliveries30d: 42, earnings30d: 980.5,
  },
  stores: [{ id: 's1', name: 'Eletro Center', situation: 'admin_paused' }],
  wallets: { cliente: { balance: 120, available: 100, pending: 20, blocked: 0 }, motoboy: null },
  timeline: { items: [TL_ITEM], nextCursor: 'tc1' },
  can: { block: false, unblock: true, disconnect: true, roles: true, forgiveDebt: true, note: true },
};
const STORE_ITEM = {
  id: 's1', name: 'Eletro Center', ownerName: 'Renato Nunes', plan: 2, mode: 'custodia', rating90d: 4.8,
  cancelRate30d: 0.125, receiving: 'ok', situation: 'open', attention: false,
};
const STORE_DETAIL = {
  profile: {
    id: 's1', name: 'Eletro Center', cnpj: '12.345.678/0001-90', owner: { id: 'p9', name: 'Renato Nunes' }, city: 'São Paulo',
    situation: 'admin_paused', adminPause: { at: '2026-10-20T12:00:00.000Z', reason: 'Documentos vencidos', by: { id: 'a1', name: 'Marina Rocha' } },
  },
  stats30d: { orders: 120, cancelledByStore: 3, rating: 4.7 },
  nearbyCouriers: { online: 3, free: 1 },
  nearbyRadiusKm: 12,
  reviews: [{ orderId: 'o1', rating: 5, comment: 'Chegou rápido', createdAt: '2026-10-19T12:00:00.000Z' }],
  receiving: { status: 'pending', detail: 'Conta Asaas em análise' },
  plan: { plan: null, mode: 'saas', saas: { status: 'trialing', trialEndsAt: '2026-11-01T12:00:00.000Z', paidUntil: null, cancelledAt: null } },
  orders: [{ id: 'o2', status: 'cancelado', total: 99.9, createdAt: '2026-10-18T12:00:00.000Z' }],
  timeline: { items: [], nextCursor: null },
  can: { pause: false, unpause: true, note: true, extendTrial: false, cancelSaas: false },
};

beforeEach(() => jest.clearAllMocks());

describe('chamadas (rotas do plano mestre)', () => {
  it('lista de pessoas: sem filtro vai sem query; q aparado como digitado, aba, dívida e cursor', async () => {
    get.mockResolvedValue({ data: { items: [USER_ITEM], nextCursor: null } });
    await expect(fetchUsers()).resolves.toEqual({ items: [USER_ITEM], nextCursor: null });
    expect(get).toHaveBeenLastCalledWith('/admin/users');
    await fetchUsers({ q: '  123.456.789-00 ', tab: 'motoboy', withDebt: true, cursor: 'c1' });
    expect(get).toHaveBeenLastCalledWith('/admin/users?q=123.456.789-00&tab=motoboy&withDebt=1&cursor=c1');
    await fetchUsers({ q: '   ', tab: 'all', withDebt: false });
    expect(get).toHaveBeenLastCalledWith('/admin/users');
  });

  it('lista de lojas: q e filtro; "all" não vai', async () => {
    get.mockResolvedValue({ data: { items: [STORE_ITEM], nextCursor: null } });
    await fetchStores({ q: 'Eletro Center', filter: 'admin_paused' });
    expect(get).toHaveBeenLastCalledWith('/admin/stores?q=Eletro+Center&filter=admin_paused');
    await fetchStores({ filter: 'all', cursor: 'c9' });
    expect(get).toHaveBeenLastCalledWith('/admin/stores?cursor=c9');
  });

  it('fichas e histórico', async () => {
    get.mockResolvedValueOnce({ data: USER_DETAIL });
    await expect(fetchUserDetail('p1')).resolves.toEqual(USER_DETAIL);
    expect(get).toHaveBeenLastCalledWith('/admin/users/p1');
    get.mockResolvedValueOnce({ data: { items: [TL_ITEM], nextCursor: null } });
    await fetchUserTimeline('p1', 'tc1');
    expect(get).toHaveBeenLastCalledWith('/admin/users/p1/timeline?cursor=tc1');
    get.mockResolvedValueOnce({ data: STORE_DETAIL });
    await expect(fetchStoreDetail('s1')).resolves.toEqual(STORE_DETAIL);
    expect(get).toHaveBeenLastCalledWith('/admin/stores/s1');
    get.mockResolvedValueOnce({ data: { items: [], nextCursor: null } });
    await fetchStoreTimeline('s1', 'tc2');
    expect(get).toHaveBeenLastCalledWith('/admin/stores/s1/timeline?cursor=tc2');
  });

  it('ações da pessoa: corpo exato (motivo opcional só vai quando escrito)', async () => {
    put.mockResolvedValue({ data: {} });
    post.mockResolvedValue({ data: {} });
    await blockUser('p1', 'Fraude no cupom');
    expect(put).toHaveBeenLastCalledWith('/admin/users/p1/status', { status: 'blocked', reason: 'Fraude no cupom' });
    await unblockUser('p1', '');
    expect(put).toHaveBeenLastCalledWith('/admin/users/p1/status', { status: 'active' });
    await unblockUser('p1', 'Engano da equipe');
    expect(put).toHaveBeenLastCalledWith('/admin/users/p1/status', { status: 'active', reason: 'Engano da equipe' });
    await disconnectUser('p1');
    expect(post.mock.calls[0]).toEqual(['/admin/users/p1/disconnect']);
    await forgiveDebt('p1', 'd1', 'Cliente explicou o atraso');
    expect(post).toHaveBeenLastCalledWith('/admin/users/p1/debts/d1/forgive', { reason: 'Cliente explicou o atraso' });
    await addUserNote('p1', 'Pediu retorno');
    expect(post).toHaveBeenLastCalledWith('/admin/users/p1/notes', { text: 'Pediu retorno' });
  });

  it('papéis: PUT da lista completa e storesClosed (ausente = 0)', async () => {
    put.mockResolvedValueOnce({ data: { storesClosed: 2 } }).mockResolvedValueOnce({ data: {} });
    await expect(saveUserRoles('p1', ['lojista', 'cliente'])).resolves.toEqual({ storesClosed: 2 });
    expect(put).toHaveBeenLastCalledWith('/admin/users/p1/roles', { roles: ['lojista', 'cliente'] });
    await expect(saveUserRoles('p1', ['cliente'])).resolves.toEqual({ storesClosed: 0 });
  });

  it('ações da loja', async () => {
    post.mockResolvedValue({ data: {} });
    await pauseStore('s1', 'Documentos vencidos');
    expect(post).toHaveBeenLastCalledWith('/admin/stores/s1/pause', { reason: 'Documentos vencidos' });
    await unpauseStore('s1', '');
    expect(post).toHaveBeenLastCalledWith('/admin/stores/s1/unpause', {});
    await unpauseStore('s1', 'Documentos em dia');
    expect(post).toHaveBeenLastCalledWith('/admin/stores/s1/unpause', { reason: 'Documentos em dia' });
    await addStoreNote('s1', 'Dono pediu prazo');
    expect(post).toHaveBeenLastCalledWith('/admin/stores/s1/notes', { text: 'Dono pediu prazo' });
  });

  it('resposta fora do formato vira erro (a lista antiga de /admin/users era um array)', async () => {
    get.mockResolvedValueOnce({ data: [USER_ITEM] });
    await expect(fetchUsers()).rejects.toThrow('resposta fora do formato');
    get.mockResolvedValueOnce({ data: { ...USER_DETAIL, can: undefined } });
    await expect(fetchUserDetail('p1')).rejects.toThrow('resposta fora do formato');
  });
});

describe('checagem do formato (fail closed)', () => {
  it('listas', () => {
    expect(isUserListResponse({ items: [USER_ITEM], nextCursor: null })).toBe(true);
    expect(isUserListResponse({ items: [USER_ITEM] })).toBe(false);
    expect(isUserListResponse({ items: [{ ...USER_ITEM, status: 'banido' }], nextCursor: null })).toBe(false);
    expect(isUserListResponse({ items: [{ ...USER_ITEM, pendingDebt: '12' }], nextCursor: null })).toBe(false);
    expect(isStoreListResponse({ items: [STORE_ITEM], nextCursor: 'c1' })).toBe(true);
    expect(isStoreListResponse({ items: [{ ...STORE_ITEM, cancelRate30d: null, rating90d: null, plan: null }], nextCursor: null })).toBe(true);
    expect(isStoreListResponse({ items: [{ ...STORE_ITEM, situation: 'sumida' }], nextCursor: null })).toBe(false);
    expect(isStoreListResponse({ items: [{ ...STORE_ITEM, attention: 'sim' }], nextCursor: null })).toBe(false);
  });

  it('ficha da pessoa: blocos opcionais ausentes ou null passam; se vieram, no formato', () => {
    expect(isUserDetail(USER_DETAIL)).toBe(true);
    const { motoboy, stores, wallets, ...semOpcionais } = USER_DETAIL;
    expect(isUserDetail(semOpcionais)).toBe(true);
    expect(isUserDetail({ ...USER_DETAIL, motoboy: null, stores: null, wallets: null })).toBe(true);
    const { earnings30d, ...semGanhos } = motoboy;
    expect(isUserDetail({ ...USER_DETAIL, motoboy: semGanhos })).toBe(true);
    expect(isUserDetail({ ...USER_DETAIL, motoboy: { ...motoboy, earnings30d: '980' } })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, verification: [{ kind: 'email', status: 'none', reason: null, at: null }] })).toBe(true);
    expect(isUserDetail({ ...USER_DETAIL, verification: [{ kind: 'email', status: 'verified', reason: null, at: null }] })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, wallets: { ...wallets, cliente: { ...wallets.cliente, balance: '120' } } })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, wallets: { cliente: null } })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, wallets: { balance: 120, available: 100, pending: 20, blocked: 0 } })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, stores: [{ ...stores[0], situation: 'x' }] })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, can: { ...USER_DETAIL.can, forgiveDebt: undefined } })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, debts: [{ ...USER_DETAIL.debts[0], status: 'charged' }] })).toBe(false);
    expect(isUserDetail({ ...USER_DETAIL, profile: { ...USER_DETAIL.profile, phone: '11999994321', phoneLast4: undefined } })).toBe(false);
  });

  it('ficha da loja e histórico', () => {
    expect(isStoreDetail(STORE_DETAIL)).toBe(true);
    expect(isStoreDetail({ ...STORE_DETAIL, profile: { ...STORE_DETAIL.profile, adminPause: null } })).toBe(true);
    expect(isStoreDetail({ ...STORE_DETAIL, profile: { ...STORE_DETAIL.profile, adminPause: { at: '2026-10-20T12:00:00.000Z', by: null } } })).toBe(false);
    expect(isStoreDetail({ ...STORE_DETAIL, plan: { ...STORE_DETAIL.plan, saas: null } })).toBe(true);
    expect(isStoreDetail({ ...STORE_DETAIL, can: { pause: true, unpause: false } })).toBe(false);
    expect(isTimelineResponse({ items: [{ ...TL_ITEM, type: 'trial_extend' }], nextCursor: null })).toBe(true);
    expect(isTimelineResponse({ items: [{ ...TL_ITEM, actor: { id: 'a1', name: 'Marina' } }], nextCursor: null })).toBe(false);
  });
});

describe('papéis, rótulos e textos curtos', () => {
  it('papéis: Cliente só quando não há outro; ordem da tela; texto do toast', () => {
    expect(rolesText(['cliente'])).toBe('Cliente');
    expect(rolesText([])).toBe('Cliente');
    expect(rolesText(['cliente', 'motoboy', 'gerente_motoboys'])).toBe('Gerente de motoboys · Motoboy');
    expect(withCliente(['motoboy', 'lojista'])).toEqual(['lojista', 'cliente', 'motoboy']);
    expect(rolesSavedText(0)).toBe('Papéis atualizados.');
    expect(rolesSavedText(1)).toBe('Papéis atualizados. A loja da pessoa foi fechada.');
    expect(rolesSavedText(3)).toBe('Papéis atualizados. As 3 lojas da pessoa foram fechadas.');
  });

  it('motivo de 5 a 500 e nota de 1 a 2000, sem contar os espaços das pontas', () => {
    expect(reasonIsValid('  abcd  ')).toBe(false);
    expect(reasonIsValid(' abcde ')).toBe(true);
    expect(reasonIsValid('x'.repeat(500))).toBe(true);
    expect(reasonIsValid('x'.repeat(501))).toBe(false);
    expect(noteIsValid('   ')).toBe(false);
    expect(noteIsValid(' x ')).toBe(true);
    expect(noteIsValid('x'.repeat(2001))).toBe(false);
  });

  it('último acesso, telefone, plano, nota e taxa', () => {
    expect(lastSeenLabel(null, NOW)).toBe('Sem registro');
    expect(lastSeenLabel('2026-10-20T14:50:00.000Z', NOW)).toBe('há 10 min');
    expect(lastSeenLabel('2026-09-10T15:00:00.000Z', NOW)).toBe('10/09/2026');
    expect(phoneLabel('4321')).toBe('•••• 4321');
    expect(phoneLabel(null)).toBe('Sem telefone');
    expect(planLabel(2)).toBe('Plano 2');
    expect(planLabel(null)).toBe('—');
    expect(ratingLabel(4.8)).toBe('4,8');
    expect(ratingLabel(null)).toBe('Sem nota');
    expect(rateLabel(0.125)).toBe('12,5%');
    expect(rateLabel(null)).toBe('Poucos pedidos');
  });

  it('bloqueio e pausa do DROP: motivo, autor e data', () => {
    expect(blockNote(USER_DETAIL.profile.block)).toBe('Motivo: Fraude no cupom · por Marina Rocha · em 19/10/2026');
    expect(blockNote({ reason: null, at: null, by: null })).toBe('');
    expect(adminPauseNote(STORE_DETAIL.profile.adminPause)).toBe('Motivo: Documentos vencidos · por Marina Rocha · em 20/10/2026');
    expect(adminPauseNote({ at: '2026-10-20T12:00:00.000Z', reason: 'Mensalidade cancelada', by: { id: 'system', name: null } }))
      .toBe('Motivo: Mensalidade cancelada · pelo sistema · em 20/10/2026');
  });

  it('histórico: rótulo, autor e detalhe', () => {
    expect(actionLabel('block')).toBe('Conta bloqueada');
    expect(actionLabel('store_pause')).toBe('Loja pausada pelo DROP');
    expect(actionLabel('note')).toBe('Nota');
    expect(actionLabel('tipo_novo')).toBe('Ação da equipe');
    expect(timelineActor({ id: 'system', name: null, role: 'system' })).toBe('Sistema');
    expect(timelineActor({ id: 'a1', name: 'Marina Rocha', role: 'ceo' })).toBe('Marina Rocha · CEO');
    expect(timelineActor({ id: 'a2', name: null, role: 'gerente_geral' })).toBe('Pessoa removida · Gerente geral');
    expect(timelineDetail({ ...TL_ITEM, type: 'roles_change', meta: { before: ['cliente'], after: ['cliente', 'lojista'] } }))
      .toBe('Cliente → Lojista');
    expect(timelineDetail({ ...TL_ITEM, type: 'debt_forgive', meta: { debtId: 'd1', amount: 12.5 } })).toBe('R$ 12,50');
    expect(timelineDetail({ ...TL_ITEM, type: 'roles_change', meta: { before: 'cliente' } })).toBeNull();
    expect(timelineDetail(TL_ITEM)).toBeNull();
  });
});

describe('erros', () => {
  it('o código vem de `code` (ou de `error.code`, formato do errorHandler); `error` em texto nunca vira código', () => {
    expect(accountErrorCode(http(409, { error: 'Já pausada', code: 'ALREADY_PAUSED' }))).toBe('ALREADY_PAUSED');
    expect(accountErrorCode(http(400, { success: false, error: { message: 'x', statusCode: 400, code: 'VALIDATION_ERROR' } }))).toBe('VALIDATION_ERROR');
    expect(accountErrorCode(http(409, { error: 'DEBT_NOT_PENDING' }))).toBeNull();
    expect(accountErrorCode(http(400, { error: 'Invalid status' }))).toBeNull();
    expect(accountErrorCode(new Error('x'))).toBeNull();
  });

  it.each([
    ['403 sempre "sem permissão"', http(403, { error: 'Permissão negada. Você precisa de: user:block' }), 'Você não tem permissão para isso'],
    ['403 equipe: só o CEO (STAFF_TARGET_FORBIDDEN)', http(403, { error: 'Somente o CEO pode bloquear ou desconectar alguém da equipe.', code: 'STAFF_TARGET_FORBIDDEN' }), 'Somente o CEO pode bloquear ou desconectar alguém da equipe.'],
    ['403 autoperdão (SELF_ACTION_FORBIDDEN)', http(403, { error: 'Você não pode perdoar a própria dívida.', code: 'SELF_ACTION_FORBIDDEN' }), 'Você não pode perdoar a própria dívida.'],
    ['403 com outro código continua "sem permissão"', http(403, { error: 'x', code: 'ALGO_NOVO' }), 'Você não tem permissão para isso'],
    ['motivo', http(400, { error: 'Escreva o motivo.', code: 'REASON_REQUIRED' }), 'Escreva o motivo, de 5 a 500 caracteres.'],
    ['nota', http(400, { error: 'x', code: 'NOTE_INVALID' }), 'A nota precisa ter de 1 a 2000 caracteres.'],
    ['dívida já cobrada', http(409, { error: 'x', code: 'DEBT_NOT_PENDING' }), 'Esta dívida não está mais pendente: já foi cobrada ou perdoada. A ficha foi atualizada.'],
    ['já pausada', http(409, { code: 'ALREADY_PAUSED', error: 'x' }), 'A loja já está pausada pelo DROP. A ficha foi atualizada.'],
    ['não pausada', http(409, { error: 'x', code: 'NOT_PAUSED' }), 'A loja não está pausada pelo DROP. A ficha foi atualizada.'],
    ['pessoa', http(404, { error: 'Pessoa não encontrada.', code: 'USER_NOT_FOUND' }), 'Pessoa não encontrada.'],
    ['loja', http(404, { error: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' }), 'Loja não encontrada.'],
    ['dívida', http(404, { error: 'Dívida não encontrada.', code: 'DEBT_NOT_FOUND' }), 'Dívida não encontrada.'],
    ['texto da rota antiga', http(400, { error: 'Voce nao pode bloquear a propria conta' }), 'Voce nao pode bloquear a propria conta'],
    ['código desconhecido: o texto do servidor', http(400, { error: 'Texto do servidor', code: 'ALGO_NOVO' }), 'Texto do servidor'],
    ['código desconhecido sem texto', http(400, { code: 'ALGO_NOVO' }), 'Não deu certo. Tente de novo.'],
    ['sem conexão', { message: 'Network Error' }, 'Sem conexão com o servidor. Tente de novo.'],
  ])('mensagem: %s', (_nome, err, text) => {
    expect(accountErrorMessage(err)).toBe(text);
  });

  it('conflito de estado só com os 409 da D3b-2a; achatado para a AdminSheet com status e código', () => {
    expect(isAccountConflict(http(409, { error: 'x', code: 'ALREADY_PAUSED' }))).toBe(true);
    expect(isAccountConflict(http(409, { code: 'DEBT_NOT_PENDING', error: 'x' }))).toBe(true);
    expect(isAccountConflict(http(409, { code: 'ROLE_HAS_OPEN_WORK' }))).toBe(false);
    expect(isAccountConflict(http(400, { error: 'x', code: 'DEBT_NOT_PENDING' }))).toBe(false);
    expect(flattenAccountError(http(409, { error: 'x', code: 'NOT_PAUSED' }))).toEqual({
      response: { status: 409, data: { error: 'A loja não está pausada pelo DROP. A ficha foi atualizada.', code: 'NOT_PAUSED' } },
    });
    expect(flattenAccountError(new Error('x'), 'Não deu para pausar.')).toEqual({
      response: { status: undefined, data: { error: 'Não deu para pausar.' } },
    });
  });
});
