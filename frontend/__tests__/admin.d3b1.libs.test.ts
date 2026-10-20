/**
 * D3b-1 · P3.1 — peças sem tela da Operação ao vivo (lib/adminOps): chamadas às rotas do plano mestre,
 * checagem do formato (fail closed), fila por grupo e filtro, linha do tempo com as ações do admin, "Sem sinal",
 * rótulos e as mensagens dos 409 em português.
 */
import api from '../lib/api';
import {
  adminCancelOrder, adminOrderStatus, adminReassign, ageLabel, buildQueueRows, cancelResultText, cancellationNote,
  elapsedLabel, fetchAdminOrder, fetchAdminOrders, fetchCancelPreview, fetchOpsMap, fetchOpsSummary, fetchQueue,
  flattenOpsError, gmvComparison, isAdminOrderDetail, isAdminOrdersResponse, isCancelPreview, isOpsMapResponse, isQueueResponse, isOpsConflict, isUnpaidPreview, kmLabel, mergeTimeline, minutesLabel, motoboyMapState, motoboyOrder,
  opsErrorMessage, orderTag, pctLabel, queueTotal, radiusLabel,
  type AdminOrderActionView, type OpsMapResponse, type QueueGroupEntry, type QueueTag, type TimelineStep,
} from '../lib/adminOps';

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

const NOW = Date.parse('2026-10-20T15:00:00.000Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const SUMMARY = {
  today: {
    gmv: 1530.5, gmvLastWeekSameTime: 1200, orders: 42, ordersActive: 7, cancelPct: 4.8, cancelLate: 1,
    motoboysOnline: 9, motoboysDelivering: 5, motoboysFree: 4,
  },
  perHour: [{ hour: 10, count: 3 }],
  health: { storeAcceptAvgMin: 4.2, findMotoboyAvgMin: null, deliveryAvgMin: 18 },
};
const META = {
  active: 7, activePaid: 6, awaitingPix: 1, attention: 2, acceptAvgMin: 4.4, acceptLimitMin: 10,
  findMotoboyAvgMin: null, poolTimeoutMin: 8, deliveredToday: 31, attentionTruncated: false,
};
const ROW = {
  id: 'o1', shortId: 'a1b2c3', status: 'pago', deliveryStatus: null, store: { id: 's1', name: 'Sabor da Vila' },
  motoboy: null, createdAt: ago(20), stageSince: ago(14), total: 58.9, attention: 'loja_parada',
};
const DETAIL = {
  id: 'o1', shortId: 'a1b2c3', status: 'pago', deliveryStatus: null, settlementMode: 'custody',
  store: { id: 's1', name: 'Sabor da Vila' }, customer: { id: 'c1', name: 'Ana Souza', ordersCount: 12, cancellations30d: 1 },
  motoboy: null, timeline: [], adminActions: [], items: [],
  money: {
    subtotal: 56, deliveryFee: 8.9, couponDiscount: 5, walletApplied: 0, paidByCustomer: 59.9,
    storeShare: null, motoboyShare: null, platformShare: null, payouts: [], motoboyTransfer: null,
  },
  cancellation: null, refundPending: false, allowedActions: [],
};
const MAP: OpsMapResponse = {
  motoboys: [
    { id: 'm1', name: 'Carlos Lima', lat: -23.55, lng: -46.63, updatedAt: ago(0.5), state: 'delivering', orderId: 'o2', shortId: 'd4e5f6' },
    { id: 'm2', name: 'Bruno Reis', lat: -23.56, lng: -46.64, updatedAt: ago(1), state: 'free', orderId: null, shortId: null },
  ],
  waiting: [{
    orderId: 'o1', shortId: 'a1b2c3', storeName: 'Sabor da Vila', storeLat: -23.54, storeLng: -46.62,
    since: ago(6), radiusKm: 3, customerDeciding: false,
  }],
  inDelivery: [{ orderId: 'o2', shortId: 'd4e5f6', motoboyName: 'Carlos Lima', stage: 'levando' }],
  dispatch: { initialKm: 3, stepKm: 1.5, stepSeconds: 60, maxKm: 12, poolTimeoutMin: 8 },
};
const PREVIEW = {
  fault: 'customer', customerRefund: 80, feeCharged: 20, motoboyCompensation: 7,
  compensationPaidBy: 'customer', countsAgainst: 'customer',
};

beforeEach(() => jest.clearAllMocks());

describe('chamadas (rotas do plano mestre)', () => {
  it('leituras: URL exata e o corpo devolvido', async () => {
    get.mockResolvedValueOnce({ data: { groups: [] } });
    await expect(fetchQueue()).resolves.toEqual({ groups: [] });
    expect(get).toHaveBeenLastCalledWith('/admin/queue');

    get.mockResolvedValueOnce({ data: SUMMARY });
    await expect(fetchOpsSummary()).resolves.toEqual(SUMMARY);
    expect(get).toHaveBeenLastCalledWith('/admin/ops/summary');

    get.mockResolvedValueOnce({ data: DETAIL });
    await expect(fetchAdminOrder('o1')).resolves.toEqual(DETAIL);
    expect(get).toHaveBeenLastCalledWith('/admin/orders/o1');

    get.mockResolvedValueOnce({ data: MAP });
    await expect(fetchOpsMap()).resolves.toEqual(MAP);
    expect(get).toHaveBeenLastCalledWith('/admin/ops/map');

    get.mockResolvedValueOnce({ data: PREVIEW });
    await expect(fetchCancelPreview('o1', 'customer')).resolves.toEqual(PREVIEW);
    expect(get).toHaveBeenLastCalledWith('/admin/orders/o1/cancel-preview?fault=customer');
  });

  it('lista de pedidos: filtro sempre; loja e cursor só quando há', async () => {
    get.mockResolvedValue({ data: { items: [ROW], nextCursor: null, meta: META } });
    await fetchAdminOrders('atencao');
    expect(get).toHaveBeenLastCalledWith('/admin/orders?filtro=atencao');
    await fetchAdminOrders('todos', { storeId: 's1', cursor: 'c1' });
    expect(get).toHaveBeenLastCalledWith('/admin/orders?filtro=todos&storeId=s1&cursor=c1');
    await fetchAdminOrders('cancelados_hoje', { storeId: null, cursor: 'c2' });
    expect(get).toHaveBeenLastCalledWith('/admin/orders?filtro=cancelados_hoje&cursor=c2');
  });

  it('lista sem nextCursor no corpo: vira null', async () => {
    get.mockResolvedValueOnce({ data: { items: [ROW], meta: META } });
    await expect(fetchAdminOrders('todos')).resolves.toMatchObject({ nextCursor: null });
  });

  it('ações: o corpo do mestre', async () => {
    post.mockResolvedValueOnce({ data: { ok: true, cancellationId: 'k1', refundAmount: 100, refundStatus: 'processed' } });
    await expect(adminCancelOrder('o1', 'platform', 'Loja pegou fogo'))
      .resolves.toEqual({ ok: true, cancellationId: 'k1', refundAmount: 100, refundStatus: 'processed' });
    expect(post).toHaveBeenLastCalledWith('/admin/orders/o1/cancel', { fault: 'platform', reason: 'Loja pegou fogo' });

    post.mockResolvedValueOnce({ data: { ok: true } });
    await expect(adminReassign('o1', 'Motoboy parado')).resolves.toBeUndefined();
    expect(post).toHaveBeenLastCalledWith('/admin/orders/o1/reassign', { reason: 'Motoboy parado' });
  });

  it.each([
    ['fila sem grupos', () => fetchQueue(), { items: [] }],
    ['resumo sem "today"', () => fetchOpsSummary(), { perHour: [], health: {} }],
    ['resumo com número em texto', () => fetchOpsSummary(), { ...SUMMARY, today: { ...SUMMARY.today, gmv: '1530.5' } }],
    ['lista sem meta', () => fetchAdminOrders('todos'), { items: [], nextCursor: null }],
    ['lista sem attentionTruncated', () => fetchAdminOrders('todos'), { items: [], nextCursor: null, meta: { ...META, attentionTruncated: undefined } }],
    ['pedido sem allowedActions', () => fetchAdminOrder('o1'), { ...DETAIL, allowedActions: undefined }],
    ['mapa sem despacho', () => fetchOpsMap(), { ...MAP, dispatch: null }],
    ['prévia sem o valor do cliente', () => fetchCancelPreview('o1', 'store'), { ...PREVIEW, customerRefund: null }],
  ])('resposta fora do formato vira erro: %s', async (_nome, call, data) => {
    get.mockResolvedValueOnce({ data });
    await expect(call()).rejects.toThrow('resposta fora do formato');
  });

  it('ação sem a confirmação do servidor vira erro', async () => {
    post.mockResolvedValueOnce({ data: { message: 'ok' } });
    await expect(adminCancelOrder('o1', 'store', 'Loja fechou')).rejects.toThrow('resposta fora do formato');
    post.mockResolvedValueOnce({ data: {} });
    await expect(adminReassign('o1', 'Motoboy parado')).rejects.toThrow('resposta fora do formato');
  });
});

const item = (id: string, min: number, tag: QueueTag = 'Esperando') =>
  ({ id, title: id, context: '', since: ago(min), tag, href: `/x/${id}` });
const entry = (type: QueueGroupEntry['type'], group: QueueGroupEntry['group'], items: ReturnType<typeof item>[], extra: Partial<QueueGroupEntry> = {}) =>
  ({ type, group, count: items.length, items, ...extra }) as QueueGroupEntry;
const GROUPS: QueueGroupEntry[] = [
  entry('order_no_motoboy', 'operation', [item('o1', 50, 'Operação')]),
  entry('plan_change', 'revenue', [item('p1', 120, 'Receita')]),
  entry('withdrawal', 'person_waiting', [item('w1', 30)]),
  entry('support', 'person_waiting', [item('s1', 90, 'Suporte')]),
  entry('refund', 'customer_money', [item('r1', 10, 'Urgente')], { count: 3 }),
];

describe('fila de hoje', () => {
  it('ordem: dinheiro do cliente → pessoa esperando → receita → operação; no grupo, a mais antiga primeiro', () => {
    expect(buildQueueRows(GROUPS, 'tudo').map((r) => r.key)).toEqual([
      'refund:r1', 'refund:more', 'support:s1', 'withdrawal:w1', 'plan_change:p1', 'order_no_motoboy:o1',
    ]);
  });

  it('"mais N" conta o que não veio na lista (até 5 itens por tipo)', () => {
    expect(buildQueueRows(GROUPS, 'tudo').find((r) => r.kind === 'more')).toMatchObject({ type: 'refund', count: 2 });
  });

  it.each([
    ['tudo', ['refund:r1', 'refund:more', 'support:s1', 'withdrawal:w1', 'plan_change:p1', 'order_no_motoboy:o1'], 7],
    ['dinheiro', ['refund:r1', 'refund:more', 'plan_change:p1'], 4],
    ['pessoas', ['support:s1', 'withdrawal:w1'], 2],
    ['operacao', ['order_no_motoboy:o1'], 1],
  ] as const)('filtro %s', (filter, keys, total) => {
    expect(buildQueueRows(GROUPS, filter).map((r) => r.key)).toEqual(keys);
    expect(queueTotal(GROUPS, filter)).toBe(total);
  });

  it('tipo com erro: uma linha de erro no fim do grupo, sem itens e fora do total', () => {
    const groups = [
      ...GROUPS.filter((g) => g.type !== 'withdrawal'),
      entry('withdrawal', 'person_waiting', [], { error: 'falhou' }),
    ];
    expect(buildQueueRows(groups, 'pessoas').map((r) => r.key)).toEqual(['support:s1', 'withdrawal:error']);
    expect(buildQueueRows(groups, 'pessoas')[1]).toMatchObject({ kind: 'error', message: 'falhou' });
    expect(queueTotal(groups, 'pessoas')).toBe(1);
  });

  it('nada pendente: nenhuma linha', () => {
    expect(buildQueueRows([entry('support', 'person_waiting', [])], 'tudo')).toEqual([]);
    expect(queueTotal([], 'tudo')).toBe(0);
  });
});

describe('rótulos e contas', () => {
  it('idade', () => {
    expect(elapsedLabel(ago(0.5), NOW)).toBe('agora');
    expect(elapsedLabel(ago(14), NOW)).toBe('14 min');
    expect(elapsedLabel(ago(125), NOW)).toBe('2 h');
    expect(elapsedLabel(ago(60 * 50), NOW)).toBe('2 d');
    expect(ageLabel(ago(14), NOW)).toBe('há 14 min');
    expect(ageLabel(ago(0), NOW)).toBe('agora');
  });

  it('minutos, porcentagem, km, raio e GMV', () => {
    expect(minutesLabel(null)).toBe('—');
    expect(minutesLabel(4.4)).toBe('4 min');
    expect(pctLabel(4.8)).toBe('4,8%');
    expect(pctLabel(0)).toBe('0%');
    expect(kmLabel(1.5)).toBe('1,5 km');
    expect(radiusLabel(null)).toBe('aberto a todos');
    expect(radiusLabel(3)).toBe('raio 3 km');
    expect(radiusLabel(4.5)).toBe('raio 4,5 km');
    expect(gmvComparison(1530.5, 1200)).toBe('+28% vs. semana passada até esta hora');
    expect(gmvComparison(900, 1200)).toBe('−25% vs. semana passada até esta hora');
    expect(gmvComparison(300, 0)).toBe('Semana passada até esta hora: R$ 0,00');
  });

  it('pedido: "#" e situação', () => {
    expect(orderTag('a1b2c3')).toBe('#a1b2c3');
    expect(orderTag('#a1b2c3')).toBe('#a1b2c3');
    expect(adminOrderStatus('criado', null)).toEqual({ label: 'Aguardando pagamento', tone: 'neutral' });
    expect(adminOrderStatus('pago', null)).toEqual({ label: 'Na loja', tone: 'warn' });
    expect(adminOrderStatus('aguardando_motoboy', 'pending')).toEqual({ label: 'Procurando motoboy', tone: 'warn' });
    expect(adminOrderStatus('aguardando_motoboy', 'assigned')).toEqual({ label: 'Motoboy indo à loja', tone: 'info' });
    expect(adminOrderStatus('aguardando_motoboy', 'picked')).toEqual({ label: 'Em entrega', tone: 'info' });
    expect(adminOrderStatus('entregue', 'delivered')).toEqual({ label: 'Entregue', tone: 'ok' });
    expect(adminOrderStatus('cancelado', 'cancelled')).toEqual({ label: 'Cancelado', tone: 'bad' });
    expect(adminOrderStatus('rejeitado', null)).toEqual({ label: 'Recusado pela loja', tone: 'bad' });
  });

  it('cancelamento: nota da linha do tempo e resultado da ação', () => {
    expect(cancellationNote({
      cancelledBy: 'admin', faultParty: 'store', reason: 'Loja fechou sem avisar', adminName: 'Marina Rocha',
      at: ago(1), refundStatus: 'pending',
    })).toBe('Motivo: Loja fechou sem avisar · por Marina Rocha · culpa: Loja');
    expect(cancellationNote({
      cancelledBy: 'customer', faultParty: null, reason: 'Desisti', adminName: null, at: ago(1), refundStatus: 'processed',
    })).toBe('Motivo: Desisti · pelo cliente');
    const r = { ok: true as const, cancellationId: 'k1', refundAmount: 100, refundStatus: 'processed' };
    expect(cancelResultText(r)).toBe('Cancelado · R$ 100,00 devolvidos');
    expect(cancelResultText({ ...r, refundAmount: 0 })).toBe('Cancelado · nada a devolver');
    expect(cancelResultText({ ...r, refundStatus: 'pending' })).toBe('Cancelado · estorno pendente, veja Estornos');
    expect(cancelResultText({ ...r, refundStatus: 'failed' })).toBe('Cancelado · estorno pendente, veja Estornos');
    // I1: pedido não pago volta com valor 0, e o status do estorno não importa.
    expect(cancelResultText({ ...r, refundAmount: 0, refundStatus: 'pending' })).toBe('Cancelado · nada a devolver');
    expect(isUnpaidPreview({ customerRefund: 0, feeCharged: 0 })).toBe(true);
    expect(isUnpaidPreview({ customerRefund: 0, feeCharged: 59.9 })).toBe(false);
    expect(isUnpaidPreview({ customerRefund: 47.9, feeCharged: 12 })).toBe(false);
  });
});

describe('linha do tempo', () => {
  const steps: TimelineStep[] = [
    { key: 'created', at: '2026-10-20T13:00:00.000Z', sincePrevMin: null },
    { key: 'paid', at: '2026-10-20T13:02:00.000Z', sincePrevMin: 2 },
    { key: 'accepted', at: null, sincePrevMin: null },
    { key: 'assigned', at: '2026-10-20T13:10:00.000Z', sincePrevMin: 8 },
    { key: 'picked', at: null, sincePrevMin: null },
  ];
  const acao = (id: string, at: string): AdminOrderActionView =>
    ({ id, action: 'reassign', actorName: 'Marina', reason: 'x', faultParty: null, at });

  it('a ação do admin entra na hora dela; a etapa sem horário fica no lugar', () => {
    expect(mergeTimeline(steps, [acao('a2', '2026-10-20T13:15:00.000Z'), acao('a1', '2026-10-20T13:05:00.000Z')]).map((e) => e.key))
      .toEqual(['s:created', 's:paid', 's:accepted', 'a:a1', 's:assigned', 's:picked', 'a:a2']);
  });
});

describe('mapa', () => {
  it('sem sinal: estado do servidor ou posição com mais de 2 min', () => {
    expect(motoboyMapState({ state: 'free', updatedAt: ago(1) }, NOW)).toBe('free');
    expect(motoboyMapState({ state: 'delivering', updatedAt: ago(3) }, NOW)).toBe('stale');
    expect(motoboyMapState({ state: 'stale', updatedAt: ago(0) }, NOW)).toBe('stale');
    expect(motoboyMapState({ state: 'free', updatedAt: 'x' }, NOW)).toBe('stale');
  });

  it('pedido do motoboy: o orderId/shortId do próprio item, com a etapa da entrega', () => {
    expect(motoboyOrder(MAP, MAP.motoboys[0])).toBe('#d4e5f6 · levando ao cliente');
    expect(motoboyOrder(MAP, MAP.motoboys[1])).toBeNull();
    // Pedido ainda fora de inDelivery (ex.: a leitura cruzou com a atribuição): só o número.
    expect(motoboyOrder({ inDelivery: [] }, { orderId: 'o7', shortId: 'h1j2k3' })).toBe('#h1j2k3');
    // Homônimo sem pedido não herda o pedido do outro (sem busca por nome).
    const homonimo = { ...MAP.motoboys[1], name: 'Carlos Lima' };
    expect(motoboyOrder(MAP, homonimo)).toBeNull();
  });
});

describe('mensagens dos erros', () => {
  it.each([
    ['pedido mudou', http(409, { code: 'ORDER_CHANGED', currentStatus: 'aguardando_motoboy', error: 'x' }), 'O pedido mudou. Recarregue.'],
    ['não cancelável, com status', http(409, { code: 'ORDER_NOT_CANCELLABLE', currentStatus: 'entregue', error: 'x' }),
      'Este pedido não pode mais ser cancelado (situação: entregue).'],
    ['não cancelável, sem status', http(409, { code: 'ORDER_NOT_CANCELLABLE', error: 'x' }), 'Este pedido não pode mais ser cancelado.'],
    ['entrega mudou: já retirado', http(409, { code: 'DELIVERY_CHANGED', currentStatus: 'picked', error: 'x' }), 'O motoboy já retirou o pedido'],
    ['entrega mudou: outro estado', http(409, { code: 'DELIVERY_CHANGED', currentStatus: 'pending', error: 'x' }), 'A entrega mudou'],
    ['não reatribuível: já retirado', http(409, { code: 'DELIVERY_NOT_REASSIGNABLE', currentStatus: 'picked', error: 'x' }),
      'O motoboy já retirou o pedido'],
    ['não reatribuível: outro estado', http(409, { code: 'DELIVERY_NOT_REASSIGNABLE', currentStatus: 'pending', error: 'x' }),
      'Só dá para reatribuir enquanto o motoboy vai até a loja.'],
    ['pedido sumiu', http(404, { code: 'ORDER_NOT_FOUND', error: 'x' }), 'Pedido não encontrado.'],
    ['motivo: texto do servidor', http(400, { code: 'REASON_REQUIRED', error: 'Motivo de 5 a 500 caracteres' }), 'Motivo de 5 a 500 caracteres'],
    ['403', http(403, { error: 'Permissão negada' }), 'Você não tem permissão para isso'],
  ])('%s', (_nome, err, text) => {
    expect(opsErrorMessage(err)).toBe(text);
  });

  it('isOpsConflict: só os 409 de pedido e de entrega', () => {
    expect(isOpsConflict(http(409, { code: 'ORDER_CHANGED' }))).toBe(true);
    expect(isOpsConflict(http(409, { code: 'DELIVERY_CHANGED' }))).toBe(true);
    expect(isOpsConflict(http(409, { code: 'IDEMPOTENCY_KEY_REUSED' }))).toBe(false);
    expect(isOpsConflict(http(400, { code: 'ORDER_CHANGED' }))).toBe(false);
    expect(isOpsConflict(new Error('Network Error'))).toBe(false);
  });

  it('formato AppError { error: { code, message } } (nota 2): código e texto lidos', () => {
    const appErr = http(409, { success: false, error: { code: 'ORDER_CHANGED', message: 'x' } });
    expect(opsErrorMessage(appErr)).toBe('O pedido mudou. Recarregue.');
    expect(isOpsConflict(appErr)).toBe(true);
    expect(flattenOpsError(http(409, { error: { code: 'TRANSFER_MANUAL_PIX', message: 'Pix manual do DROP' } })).response.data)
      .toEqual({ error: 'Pix manual do DROP', code: 'TRANSFER_MANUAL_PIX' });
  });

  it('flattenOpsError: texto em português e código, para a AdminSheet', () => {
    expect(flattenOpsError(http(409, { code: 'ORDER_CHANGED', currentStatus: 'aguardando_motoboy', error: 'x' }))).toEqual({
      response: { status: 409, data: { error: 'O pedido mudou. Recarregue.', code: 'ORDER_CHANGED' } },
    });
    expect(flattenOpsError(new Error('resposta fora do formato'), 'Não deu para cancelar o pedido.').response.data.error)
      .toBe('Não deu para cancelar o pedido.');
  });
});

describe('checagem do formato aperta além da casca (fail closed)', () => {
  const { money } = DETAIL;
  const sem = <T extends object>(o: T, k: string) => { const c = { ...o } as Record<string, unknown>; delete c[k]; return c; };

  it('casos válidos: nulos e vazios da nota 1 continuam aceitos', () => {
    expect(isAdminOrderDetail(DETAIL)).toBe(true);
    expect(isAdminOrderDetail({ ...DETAIL, money: { ...money, storeShare: 40, motoboyShare: 8.9, platformShare: 5,
      payouts: [{ id: 'p', recipientType: 'store', amount: 40, status: 'paid' }], motoboyTransfer: { status: 'done', amount: 8.9 } } })).toBe(true);
    expect(isAdminOrdersResponse({ items: [ROW], nextCursor: null, meta: META })).toBe(true);
    expect(isCancelPreview({ ...PREVIEW, compensationPaidBy: null, countsAgainst: null })).toBe(true);
    expect(isOpsMapResponse(MAP)).toBe(true);
    expect(isQueueResponse({ groups: GROUPS })).toBe(true);
  });

  it.each([
    ['money incompleto', { ...DETAIL, money: sem(money, 'paidByCustomer') }],
    ['money com número em texto', { ...DETAIL, money: { ...money, subtotal: '56' } }],
    ['payouts ausente', { ...DETAIL, money: sem(money, 'payouts') }],
    ['motoboyTransfer ausente', { ...DETAIL, money: sem(money, 'motoboyTransfer') }],
    ['storeShare ausente', { ...DETAIL, money: sem(money, 'storeShare') }],
    ['settlementMode desconhecido', { ...DETAIL, settlementMode: 'x' }],
    ['cliente sem ordersCount', { ...DETAIL, customer: sem(DETAIL.customer, 'ordersCount') }],
    ['etapa da linha do tempo sem horário definido', { ...DETAIL, timeline: [{ key: 'paid', sincePrevMin: null }] }],
    ['item sem total', { ...DETAIL, items: [{ name: 'x', quantity: 1, unitPrice: 2 }] }],
  ])('pedido do admin: %s', (_n, d) => expect(isAdminOrderDetail(d)).toBe(false));

  it.each([
    ['linha sem stageSince', sem(ROW, 'stageSince')],
    ['linha com stageSince inválido', { ...ROW, stageSince: 'ontem' }],
    ['linha sem shortId', sem(ROW, 'shortId')],
  ])('lista de pedidos: %s', (_n, row) => expect(isAdminOrdersResponse({ items: [row], nextCursor: null, meta: META })).toBe(false));

  it.each([
    ['sem countsAgainst', sem(PREVIEW, 'countsAgainst')],
    ['compensationPaidBy fora do enum', { ...PREVIEW, compensationPaidBy: 'banco' }],
  ])('prévia: %s', (_n, d) => expect(isCancelPreview(d)).toBe(false));

  it('mapa: stage desconhecido e espera sem horário', () => {
    expect(isOpsMapResponse({ ...MAP, inDelivery: [{ ...MAP.inDelivery[0], stage: 'voando' }] })).toBe(false);
    expect(isOpsMapResponse({ ...MAP, waiting: [sem(MAP.waiting[0], 'since')] })).toBe(false);
  });

  it('fila: item sem since ou com since inválido', () => {
    const bom = item('o1', 5);
    expect(isQueueResponse({ groups: [entry('refund', 'customer_money', [sem(bom, 'since') as any])] })).toBe(false);
    expect(isQueueResponse({ groups: [entry('refund', 'customer_money', [{ ...bom, since: 'x' }])] })).toBe(false);
    expect(isQueueResponse({ groups: [entry('refund', 'customer_money', [{ ...bom, tag: 'Outra' } as any])] })).toBe(false);
  });
});
