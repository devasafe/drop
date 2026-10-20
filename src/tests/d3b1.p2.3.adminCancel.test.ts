/**
 * D3b-1 · P2.3 — POST /admin/orders/:id/cancel com culpa (spec 4.2), custódia e SaaS.
 * Cenário: total 52, entrega 12; taxas 10%/50%. Custódia com PAYMENT_GATEWAY 'none' (reembolso na
 * carteira); SaaS com o Asaas da loja mockado no client (estorno 'REFUNDED').
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
      getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn(),
    },
  };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn(), emitAdminOrderChanged: jest.fn() };
});

import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app';
import env from '../config/env';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import notifier from '../services/notifier';
import { emitAdminOrderChanged, emitAdminNotification } from '../utils/socketEmitter';
import { runMotoboyTransfers } from '../jobs/motoboyTransfers.job';
import { storeHasOverdueTransfer, sendTransfer } from '../services/asaasLoja/motoboyTransfer';
import walletService from '../services/wallet.prisma.service';
import { encryptSensitiveData } from '../utils/encryption';
import { grantStoreConsent } from './helpers/storeConsent';
import { adminCancelOrder } from '../services/adminOps/adminCancel';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cenarioCancel, limparCancel, CancelScenario, CancelScenarioOpts, D3B1_STORE_KEY } from './helpers/d3b1Cancel';

jest.setTimeout(30000);

const DOMAIN = '@d3b1p23.test';
const TOUCHED: Role = 'gerente_lojistas';
const postAs = asaasClient.postAs as jest.Mock;
const orderChanged = emitAdminOrderChanged as jest.Mock;
const adminNotify = emitAdminNotification as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let snapshot: { role: Role; permissions: string[]; notificationTargets: Role[]; updatedBy: string }[] = [];
let restore: () => Promise<void>;
let since = new Date();
let ceo: TestUser;
let ceo2: TestUser;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  snapshot = await prisma.rolePermissions.findMany({
    where: { role: TOUCHED },
    select: { role: true, permissions: true, notificationTargets: true, updatedBy: true },
  });
});
afterAll(async () => {
  await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
  for (const row of snapshot) await prisma.rolePermissions.create({ data: row });
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  await prisma.$disconnect();
});
beforeEach(async () => {
  since = new Date();
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    directTransferMaxAmount: 150, directTransfersEnabled: false,
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => { await limparCancel(DOMAIN, since); });

const REASON = 'Cliente ligou no suporte pedindo para cancelar';
const cancel = (orderId: string, fault: string, u: TestUser = ceo, reason: string = REASON) =>
  request(app).post(`/api/admin/orders/${orderId}/cancel`).set('Authorization', bearer(u)).send({ fault, reason });
const preview = (orderId: string, fault: string) =>
  request(app).get(`/api/admin/orders/${orderId}/cancel-preview?fault=${fault}`).set('Authorization', bearer(ceo));

const orderOf = (id: string) => prisma.order.findUnique({ where: { id } });
const cancellationsOf = (orderId: string) => prisma.cancellation.findMany({ where: { orderId } });
const orderActionsOf = (orderId: string) => prisma.adminOrderAction.findMany({ where: { orderId } });
const moneyActionsOf = (orderId: string) => prisma.adminMoneyAction.findMany({ where: { targetId: orderId } });
const customerRefunds = (userId: string) => prisma.walletEntry.findMany({ where: { wallet: { owner: userId, ownerType: 'user' }, category: 'refund' } });
const motoboyPayouts = (orderId: string) => prisma.payout.findMany({ where: { orderId, recipientType: 'motoboy' } });
const transfersOf = (orderId: string) => prisma.motoboyTransfer.findMany({ where: { orderId } });
const noticesOf = (userId: string) => prisma.notification.findMany({ where: { userId } });
/** Compensação que o motoboy recebeu de fato, por qualquer caminho (Payout, carteira do DROP, Pix). */
async function motoboyCompPaid(orderId: string): Promise<number> {
  const [payouts, comp, transfers] = await Promise.all([
    motoboyPayouts(orderId),
    prisma.walletEntry.findMany({ where: { reference: `ADMIN_CANCEL_COMP_${orderId}` } }),
    transfersOf(orderId),
  ]);
  const sum = [...payouts, ...comp, ...transfers].reduce((acc, x) => acc + Number(x.amount), 0);
  return Math.round(sum * 100) / 100;
}

/** Prévia → cancelamento → conferências comuns (registro, culpa, avisos, socket). */
async function cancelAndCheck(opts: CancelScenarioOpts, fault: string): Promise<{ s: CancelScenario; prev: any; res: request.Response }> {
  const s = await cenarioCancel(DOMAIN, opts);
  const prev = (await preview(s.orderId, fault)).body;
  const res = await cancel(s.orderId, fault);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ok: true, refundAmount: prev.customerRefund });
  expect(typeof res.body.cancellationId).toBe('string');
  expect((await orderOf(s.orderId))?.status).toBe('cancelado');

  const cs = await cancellationsOf(s.orderId);
  expect(cs).toHaveLength(1);
  expect(cs[0]).toMatchObject({ id: res.body.cancellationId, cancelledBy: 'admin', faultParty: fault, adminId: ceo.userId, reason: 'Cancelado pelo suporte do DROP', details: REASON });

  const oa = await orderActionsOf(s.orderId);
  expect(oa).toHaveLength(1);
  expect(oa[0]).toMatchObject({ action: 'cancel', actorId: ceo.userId, actorRole: 'ceo', reason: REASON, faultParty: fault });
  expect(oa[0].details).toMatchObject({ previousStatus: opts.orderStatus, fault, refundAmount: prev.customerRefund, motoboyCompensation: prev.motoboyCompensation });

  const ma = await moneyActionsOf(s.orderId);
  expect(ma).toHaveLength(1);
  expect(ma[0]).toMatchObject({ type: 'order_admin_cancel', targetType: 'order', actorId: ceo.userId, reason: REASON });
  expect(Number(ma[0].amount)).toBe(prev.customerRefund);
  expect(ma[0].before).toEqual({ status: opts.orderStatus });
  // Coerência prévia × resultado: o motoboy recebe o que a prévia mostrou.
  expect(await motoboyCompPaid(s.orderId)).toBe(prev.motoboyCompensation);

  const toCustomer = await noticesOf(s.cliente.userId);
  expect(toCustomer).toHaveLength(1);
  expect(toCustomer[0].title).toBe('Pedido cancelado');
  expect(toCustomer[0].message).not.toMatch(/culpa|loja|motoboy|cliente/i);
  expect((await noticesOf(s.lojista.userId)).map((n) => n.title)).toEqual(['Pedido cancelado pelo suporte']);
  expect(orderChanged).toHaveBeenCalledWith(s.orderId, 'cancelado');
  return { s, prev, res };
}

describe('culpas na custódia', () => {
  it('cliente com motoboy em rota: devolve 40 na carteira, 12 ao motoboy (Payout released)', async () => {
    const { s, prev } = await cancelAndCheck({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'customer');
    expect(prev).toMatchObject({ customerRefund: 40, motoboyCompensation: 12, compensationPaidBy: 'customer' });
    expect((await customerRefunds(s.cliente.userId)).map((e) => Number(e.amount))).toEqual([40]);
    const p = await motoboyPayouts(s.orderId);
    expect(p.map((x) => [Number(x.amount), x.status])).toEqual([[12, 'released']]);
    const m = await noticesOf(s.motoboy.userId);
    expect(m).toHaveLength(1);
    expect(m[0].message).toContain('R$ 12,00');
  });

  it('loja depois do aceite com motoboy: 52 ao cliente, taxa 1,20 da loja, 0,60 ao motoboy', async () => {
    const { s } = await cancelAndCheck({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'store');
    expect((await customerRefunds(s.cliente.userId)).map((e) => Number(e.amount))).toEqual([52]);
    const storeWallet = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: s.storeId, ownerType: 'store' } } });
    expect(Number(storeWallet!.balance)).toBe(98.8);
    expect((await motoboyPayouts(s.orderId)).map((x) => Number(x.amount))).toEqual([0.6]);
  });

  it('motoboy: 52 ao cliente, nada ao motoboy, nenhuma taxa', async () => {
    const { s } = await cancelAndCheck({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'motoboy');
    expect((await customerRefunds(s.cliente.userId)).map((e) => Number(e.amount))).toEqual([52]);
    expect(await motoboyPayouts(s.orderId)).toHaveLength(0);
    expect(await prisma.walletEntry.count({ where: { wallet: { owner: s.motoboy.userId }, category: 'penalty' } })).toBe(0);
  });

  it('DROP: 52 ao cliente; 12 na carteira do motoboy e despesa admin_cancel_compensation no caixa', async () => {
    const { s } = await cancelAndCheck({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'platform');
    expect((await customerRefunds(s.cliente.userId)).map((e) => Number(e.amount))).toEqual([52]);
    const comp = await prisma.walletEntry.findMany({ where: { wallet: { owner: s.motoboy.userId, ownerType: 'motoboy' }, reference: `ADMIN_CANCEL_COMP_${s.orderId}` } });
    expect(comp.map((e) => [e.type, Number(e.amount)])).toEqual([['credit', 12]]);
    const cash = await prisma.appCashboxEntry.findMany({ where: { orderId: s.orderId, source: 'admin_cancel_compensation' } });
    expect(cash.map((e) => [e.type, Number(e.amount)])).toEqual([['expense', 12]]);
    expect(await motoboyPayouts(s.orderId)).toHaveLength(0);
  });
});

describe('culpas no SaaS (direto)', () => {
  it('cliente com motoboy em rota: estorno de 40 pela loja; MotoboyTransfer de 12', async () => {
    const { s, res } = await cancelAndCheck({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'customer');
    expect(res.body.refundStatus).toBe('processed');
    const refund = await prisma.directRefund.findUnique({ where: { orderId: s.orderId } });
    expect(Number(refund!.amount)).toBe(40);
    expect(refund!.requestedBy).toBe(ceo.userId);
    expect((await transfersOf(s.orderId)).map((t) => [t.reason, Number(t.amount)])).toEqual([['cancellation_compensation', 12]]);
  });

  it('loja com motoboy: estorno de 52; a loja paga 0,60 ao motoboy por Pix', async () => {
    const { s } = await cancelAndCheck({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'store');
    expect(Number((await prisma.directRefund.findUnique({ where: { orderId: s.orderId } }))!.amount)).toBe(52);
    expect((await transfersOf(s.orderId)).map((t) => Number(t.amount))).toEqual([0.6]);
  });

  it('loja com motoboy em rota (picked): compensação = storeShare; o estorno é pedido pelo admin', async () => {
    const { s, prev } = await cancelAndCheck({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'store');
    expect(prev).toMatchObject({ customerRefund: 52, feeCharged: 0, motoboyCompensation: 0.6, compensationPaidBy: 'store' });
    const refund = await prisma.directRefund.findUnique({ where: { orderId: s.orderId } });
    expect(Number(refund!.amount)).toBe(52);
    expect(refund!.requestedBy).toBe(ceo.userId);
    expect((await transfersOf(s.orderId)).map((t) => [t.payer, t.reason, Number(t.amount)])).toEqual([['store', 'cancellation_compensation', 0.6]]);
  });

  it('motoboy: estorno de 52, sem transferência', async () => {
    const { s } = await cancelAndCheck({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'motoboy');
    expect(Number((await prisma.directRefund.findUnique({ where: { orderId: s.orderId } }))!.amount)).toBe(52);
    expect(await transfersOf(s.orderId)).toHaveLength(0);
  });

  it('DROP sem motoboy na corrida: estorno de 52, sem compensação', async () => {
    const { s } = await cancelAndCheck({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'pending' }, 'platform');
    expect(Number((await prisma.directRefund.findUnique({ where: { orderId: s.orderId } }))!.amount)).toBe(52);
    expect(await transfersOf(s.orderId)).toHaveLength(0);
  });

  it('DROP com motoboy: estorno de 52; Pix manual do DROP (payer platform) que o job não envia e o Resolver fecha', async () => {
    const { s } = await cancelAndCheck({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'platform');
    expect(Number((await prisma.directRefund.findUnique({ where: { orderId: s.orderId } }))!.amount)).toBe(52);

    const [t] = await transfersOf(s.orderId);
    expect(t).toMatchObject({
      payer: 'platform', reason: 'cancellation_compensation', status: 'failed_final', lastError: 'PLATFORM_MANUAL_PIX',
      motoboyId: s.motoboy.userId, deliveryId: s.deliveryId,
    });
    expect(Number(t.amount)).toBe(12);
    expect(adminNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pix manual do DROP ao motoboy', url: '/admin/transfers' }));
    expect((await noticesOf(s.motoboy.userId)).map((n) => n.title)).toEqual(['Corrida cancelada']);

    // O job, ligado, nunca envia (nada sai da conta da loja).
    await updatePlatformConfig({ directTransfersEnabled: true } as any, 'test');
    postAs.mockClear();
    await runMotoboyTransfers(new Date(Date.now() + 60 * 60 * 1000));
    // Outras suítes podem ter deixado transferências da loja: nenhuma chamada usa a chave DESTA loja.
    expect(postAs.mock.calls.filter((c) => c[0] === D3B1_STORE_KEY)).toHaveLength(0);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))?.status).toBe('failed_final');

    // A loja não vê, não conta e não é bloqueada por esse Pix.
    const storeList = await request(app).get(`/api/stores/${s.storeId}/transfers`).set('Authorization', bearer(s.lojista));
    expect(storeList.status).toBe(200);
    expect(storeList.body.data.map((x: any) => x.id)).not.toContain(t.id);
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } });
    expect(await storeHasOverdueTransfer(s.storeId)).toBe(false);

    // "Tentar de novo" não vale para o Pix manual; o "Resolver" marca como paga, com autor e quando.
    const retry = await request(app).post(`/api/admin/transfers/${t.id}/retry`).set('Authorization', bearer(ceo));
    expect(retry.status).toBe(409);
    // Rota de transferências: erro no formato do AppError ({ error: { message, code } }), como os outros códigos dela.
    expect(retry.body.error.code).toBe('TRANSFER_MANUAL_PIX');
    const list = await request(app).get('/api/admin/transfers').set('Authorization', bearer(ceo));
    expect(list.body.data.find((x: any) => x.id === t.id)).toMatchObject({ payer: 'platform', lastError: 'PLATFORM_MANUAL_PIX' });
    const resolved = await request(app).post(`/api/admin/transfers/${t.id}/resolve`).set('Authorization', bearer(ceo))
      .send({ note: 'Pix feito pelo banco do DROP, comprovante 123' });
    expect(resolved.status).toBe(200);
    const done = await prisma.motoboyTransfer.findUnique({ where: { id: t.id } });
    expect(done).toMatchObject({ status: 'done', resolvedBy: `admin:${ceo.userId}`, lastError: null });
    expect(done!.doneAt).toBeInstanceOf(Date);
    expect(await prisma.adminMoneyAction.count({ where: { targetId: t.id, type: 'motoboy_transfer_resolve' } })).toBe(1);
  });
});

describe('Pix manual do DROP e o limite diário da loja', () => {
  it('o Pix platform resolvido hoje não consome o limite diário: a loja ainda envia até o teto cheio', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    expect((await cancel(s.orderId, 'platform')).status).toBe(200);
    const [pt] = await transfersOf(s.orderId);
    const resolved = await request(app).post(`/api/admin/transfers/${pt.id}/resolve`).set('Authorization', bearer(ceo))
      .send({ note: 'Pix feito pelo banco do DROP' });
    expect(resolved.status).toBe(200);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: pt.id } }))?.status).toBe('done');

    // Teto diário = exatamente o Pix da própria loja; o Pix do DROP (12, done hoje) não pode contar.
    await updatePlatformConfig({ directTransfersEnabled: true, directTransferDailyMaxPerStore: 100 } as any, 'test');
    await prisma.storeAsaasAccount.update({ where: { storeId: s.storeId }, data: { authWebhookConfirmedAt: new Date() } });
    await grantStoreConsent(s.storeId);
    const own = await prisma.motoboyTransfer.create({
      data: {
        deliveryId: `d3b1p23-${Date.now()}`, orderId: s.orderId, storeId: s.storeId, motoboyId: s.motoboy.userId,
        amount: 100, pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF',
        status: 'pending', nextAttemptAt: new Date(Date.now() - 60 * 1000),
      },
    });
    postAs.mockReset();
    postAs.mockResolvedValue({ id: 'tra_d3b1_p23', status: 'PENDING' });

    expect(await sendTransfer(own.id)).toBe('requested');
    const row = await prisma.motoboyTransfer.findUnique({ where: { id: own.id } });
    expect(row).toMatchObject({ status: 'requested', lastError: null });
    expect(postAs.mock.calls.filter((c) => c[0] === D3B1_STORE_KEY && c[1] === '/transfers')).toHaveLength(1);
  });
});

describe('eventos da regra da loja com admin', () => {
  const roomEmits: { room: string; event: string }[] = [];
  const fakeIo = { to: (room: string) => ({ emit: (event: string) => { roomEmits.push({ room, event }); } }), emit: jest.fn() };
  let ioSpy: jest.SpyInstance;
  beforeEach(() => {
    roomEmits.length = 0;
    // O mock de emitToRoom só pega quem importa a função; os emissores do próprio socketEmitter
    // chamam a interna. O io falso no notifier captura todas as emissões por sala.
    ioSpy = jest.spyOn(notifier as any, 'io', 'get').mockReturnValue(fakeIo as any);
  });
  afterEach(() => ioSpy.mockRestore());

  it.each(['custody', 'direct'] as const)('%s: emite order:cancelled e nunca order:rejected', async (mode) => {
    const s = await cenarioCancel(DOMAIN, { mode, orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    expect((await cancel(s.orderId, 'store')).status).toBe(200);
    const events = roomEmits.map((e) => e.event);
    expect(roomEmits).toEqual(expect.arrayContaining([
      { room: `user:${s.cliente.userId}`, event: 'order:cancelled' },
      { room: `store:${s.storeId}`, event: 'order:cancelled' },
    ]));
    expect(events).not.toContain('order:rejected');
    expect(events).not.toContain('order:rejected_by_store');
  });
});

describe('pedido não pago com motoboy na corrida: a compensação real bate com a prévia', () => {
  it.each([
    ['custody', 'motoboy'], ['custody', 'platform'], ['direct', 'motoboy'], ['direct', 'platform'],
  ] as const)('%s, culpa %s', async (mode, fault) => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    const { s, prev } = await cancelAndCheck({ mode, orderStatus: 'aguardando_motoboy', paid: false, delivery: 'assigned' }, fault);
    expect(prev.customerRefund).toBe(0);
    expect(prev.motoboyCompensation).toBe(fault === 'platform' ? 12 : 0);
    expect(await motoboyCompPaid(s.orderId)).toBe(prev.motoboyCompensation);
    expect((await moneyActionsOf(s.orderId))[0].amount).toBeNull();
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(0);
  });
});

describe('concorrência e recusas', () => {
  it('dois admins ao mesmo tempo: um 200, um 409; um só estorno, um só registro', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago', delivery: 'pending' });
    const [a, b] = await Promise.all([cancel(s.orderId, 'customer', ceo), cancel(s.orderId, 'customer', ceo2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(['ORDER_CHANGED', 'ORDER_NOT_CANCELLABLE']).toContain(loser.body.code);
    expect(loser.body.currentStatus).toBe('cancelado');
    expect(await cancellationsOf(s.orderId)).toHaveLength(1);
    expect(await orderActionsOf(s.orderId)).toHaveLength(1);
    expect(await moneyActionsOf(s.orderId)).toHaveLength(1);
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(1);
  });

  it('admin e cliente ao mesmo tempo: um só cancelamento e um só estorno', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago', delivery: 'pending' });
    const [adm, cli] = await Promise.all([
      cancel(s.orderId, 'store'),
      request(app).post(`/api/orders/${s.orderId}/cancel`).set('Authorization', bearer(s.cliente)).send({}),
    ]);
    expect([adm.status, cli.status].filter((x) => x === 200)).toHaveLength(1);
    expect(await cancellationsOf(s.orderId)).toHaveLength(1);
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(1);
    expect(await orderActionsOf(s.orderId)).toHaveLength(adm.status === 200 ? 1 : 0);
  });

  it('culpa do DROP com motoboy, dois admins ao mesmo tempo (custódia): uma compensação, uma linha de caixa, um registro', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    const [a, b] = await Promise.all([cancel(s.orderId, 'platform', ceo), cancel(s.orderId, 'platform', ceo2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.walletEntry.count({ where: { reference: `ADMIN_CANCEL_COMP_${s.orderId}` } })).toBe(1);
    expect(await prisma.appCashboxEntry.count({ where: { orderId: s.orderId, source: 'admin_cancel_compensation' } })).toBe(1);
    expect(await orderActionsOf(s.orderId)).toHaveLength(1);
    expect(await cancellationsOf(s.orderId)).toHaveLength(1);
  });

  it('culpa do DROP com motoboy, dois admins ao mesmo tempo (SaaS): uma só MotoboyTransfer payer platform', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    const [a, b] = await Promise.all([cancel(s.orderId, 'platform', ceo), cancel(s.orderId, 'platform', ceo2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ts = await transfersOf(s.orderId);
    expect(ts.map((t) => [t.payer, Number(t.amount)])).toEqual([['platform', 12]]);
    expect(await prisma.directRefund.count({ where: { orderId: s.orderId } })).toBe(1);
    expect(await orderActionsOf(s.orderId)).toHaveLength(1);
  });

  it('cancelar × finalizar a entrega ao mesmo tempo: um vence; sem estorno se a entrega venceu', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const [adm, fin] = await Promise.all([
      cancel(s.orderId, 'motoboy'),
      request(app).post(`/api/deliveries/${s.deliveryId}/finalizar`).set('Authorization', bearer(s.motoboy)).send({ pin: '12345' }),
    ]);
    expect([adm.status, fin.status].filter((x) => x === 200)).toHaveLength(1);
    const status = (await orderOf(s.orderId))?.status;
    if (adm.status === 200) {
      expect(status).toBe('cancelado');
      expect([400, 409]).toContain(fin.status);
      expect(await customerRefunds(s.cliente.userId)).toHaveLength(1);
      expect((await prisma.delivery.findUnique({ where: { id: s.deliveryId! } }))?.status).toBe('cancelled');
    } else {
      expect(status).toBe('entregue');
      expect(adm.status).toBe(409);
      // Entregue antes da leitura → NOT_CANCELLABLE; entregue entre a leitura e a trava → ORDER_CHANGED.
      expect(['ORDER_CHANGED', 'ORDER_NOT_CANCELLABLE']).toContain(adm.body.code);
      expect(adm.body.currentStatus).toBe('entregue');
      expect(await cancellationsOf(s.orderId)).toHaveLength(0);
      expect(await customerRefunds(s.cliente.userId)).toHaveLength(0);
      expect(await orderActionsOf(s.orderId)).toHaveLength(0);
    }
  });

  const finalizar = (s: CancelScenario) =>
    request(app).post(`/api/deliveries/${s.deliveryId}/finalizar`).set('Authorization', bearer(s.motoboy)).send({ pin: '12345' });

  it('em sequência, finaliza → cancela: 409 ORDER_NOT_CANCELLABLE com currentStatus entregue, nada muda', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    expect((await finalizar(s)).status).toBe(200);
    const adm = await cancel(s.orderId, 'motoboy');
    expect(adm.status).toBe(409);
    expect(adm.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE', currentStatus: 'entregue' });
    expect(await cancellationsOf(s.orderId)).toHaveLength(0);
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(0);
    expect(await orderActionsOf(s.orderId)).toHaveLength(0);
  });

  it('em sequência, cancela → finaliza: 400 da finalização (entrega já cancelada), nada é pago ao motoboy', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    expect((await cancel(s.orderId, 'motoboy')).status).toBe(200);
    const fin = await finalizar(s);
    // O código real: finalizarEntrega exige a entrega 'picked'; cancelada, responde 400 (não 409).
    expect(fin.status).toBe(400);
    expect(fin.body).toEqual({ error: 'Retirada ainda não validada pela loja' });
    expect((await orderOf(s.orderId))?.status).toBe('cancelado');
    expect((await prisma.delivery.findUnique({ where: { id: s.deliveryId! } }))?.status).toBe('cancelled');
    expect(await motoboyPayouts(s.orderId)).toHaveLength(0);
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(1);
  });

  it('a compensação do DROP falha (custódia): registro com compensationFailed e o aviso ao motoboy não promete valor', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    const original = walletService.credit.bind(walletService);
    const spy = jest.spyOn(walletService, 'credit').mockImplementation(((input: any, tx?: any) => {
      if (String(input?.reference ?? '').startsWith('ADMIN_CANCEL_COMP_')) return Promise.reject(new Error('falha simulada'));
      return original(input, tx);
    }) as any);
    try {
      const res = await cancel(s.orderId, 'platform');
      expect(res.status).toBe(200);
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.walletEntry.count({ where: { reference: `ADMIN_CANCEL_COMP_${s.orderId}` } })).toBe(0);
    expect(await prisma.appCashboxEntry.count({ where: { orderId: s.orderId, source: 'admin_cancel_compensation' } })).toBe(0);
    expect(adminNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Compensação do motoboy não paga' }));
    const [ma] = await moneyActionsOf(s.orderId);
    expect(ma.after).toMatchObject({ compensationFailed: true });
    const [oa] = await orderActionsOf(s.orderId);
    expect(oa.details).toMatchObject({ compensationFailed: true });
    const [m] = await noticesOf(s.motoboy.userId);
    expect(m.title).toBe('Corrida cancelada');
    expect(m.message).not.toMatch(/R\$/);
  });

  it('o registro falha (autor inválido): o pedido fica cancelado e a compensação do DROP fica paga', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    // Autor só com espaços: recordAdminMoneyAction recusa ("sem autor") e desfaz a transação do registro.
    const r = await adminCancelOrder({ orderId: s.orderId, fault: 'platform', reason: REASON, actor: { id: '   ', role: 'ceo' } });
    expect(r.ok).toBe(true);
    expect((await orderOf(s.orderId))?.status).toBe('cancelado');
    const comp = await prisma.walletEntry.findMany({ where: { reference: `ADMIN_CANCEL_COMP_${s.orderId}` } });
    expect(comp.map((e) => Number(e.amount))).toEqual([12]);
    expect(await prisma.appCashboxEntry.count({ where: { orderId: s.orderId, source: 'admin_cancel_compensation' } })).toBe(1);
    expect(await orderActionsOf(s.orderId)).toHaveLength(0);
    expect(await moneyActionsOf(s.orderId)).toHaveLength(0);
    expect(adminNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cancelamento sem registro completo' }));
  });

  it('pedido não pago (aguardando o Pix): nada a devolver, AdminMoneyAction sem valor e aviso sem "devolver"', async () => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'criado', paid: false, acceptedAt: false });
    const prev = await preview(s.orderId, 'customer');
    expect(prev.body.customerRefund).toBe(0);
    const res = await cancel(s.orderId, 'customer');
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(0);
    const [ma] = await moneyActionsOf(s.orderId);
    expect(ma.amount).toBeNull();
    const [n] = await noticesOf(s.cliente.userId);
    expect(n.message).toBe(`O suporte do DROP cancelou o seu pedido #${s.orderId.slice(-6)}.`);
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(0);
  });

  it('pedido entregue → 409 ORDER_NOT_CANCELLABLE', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'entregue' });
    const res = await cancel(s.orderId, 'motoboy');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE', currentStatus: 'entregue' });
  });

  it('repasse já liquidado: cancela, estorno fica pending e nada volta à carteira', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'pending' });
    await prisma.payout.create({ data: { recipientType: 'store', recipientId: s.storeId, orderId: s.orderId, amount: 40, status: 'paid', paidAt: new Date() } as any });
    const res = await cancel(s.orderId, 'motoboy');
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('pending');
    expect((await cancellationsOf(s.orderId))[0].refundStatus).toBe('pending');
    expect(await customerRefunds(s.cliente.userId)).toHaveLength(0);
  });

  it('culpa inválida 400, motivo curto 400 REASON_REQUIRED, pedido inexistente 404', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago' });
    const bad = await cancel(s.orderId, 'ninguem');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_FAULT');
    const short = await cancel(s.orderId, 'customer', ceo, '  ok  ');
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('REASON_REQUIRED');
    const nf = await cancel('nao-existe', 'customer');
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe('ORDER_NOT_FOUND');
    expect((await orderOf(s.orderId))?.status).toBe('pago');
  });

  it('sem order:admin_cancel → 403; com a permissão concedida → 200', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago' });
    const gerente = await createTestUser(TOUCHED, DOMAIN);
    await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
    expect((await cancel(s.orderId, 'customer', gerente)).status).toBe(403);
    await prisma.rolePermissions.create({ data: { role: TOUCHED, permissions: ['order:admin_cancel'], notificationTargets: [], updatedBy: 'test' } });
    const ok = await cancel(s.orderId, 'customer', gerente);
    expect(ok.status).toBe(200);
    expect((await orderActionsOf(s.orderId))[0]).toMatchObject({ actorId: gerente.userId, actorRole: TOUCHED });
  });

  it('o cliente não vê a culpa nem o autor no histórico de cancelamentos', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago' });
    expect((await cancel(s.orderId, 'store')).status).toBe(200);
    const h = await request(app).get(`/api/orders/${s.orderId}/cancellations`).set('Authorization', bearer(s.cliente));
    expect(h.status).toBe(200);
    expect(h.body.history).toHaveLength(1);
    expect(h.body.history[0].cancelledBy).toBe('admin');
    expect(h.body.history[0]).not.toHaveProperty('faultParty');
    expect(h.body.history[0]).not.toHaveProperty('adminId');
    expect(h.body.history[0]).not.toHaveProperty('details');
    const asAdmin = await request(app).get(`/api/orders/${s.orderId}/cancellations`).set('Authorization', bearer(ceo));
    expect(asAdmin.body.history[0]).toMatchObject({ faultParty: 'store', adminId: ceo.userId, details: REASON });
  });
});
