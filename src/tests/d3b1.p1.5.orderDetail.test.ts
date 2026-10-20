/**
 * D3b-1 · P1.5 — GET /admin/orders/:id (Pedido · visão do admin, spec 3.3): linha do tempo com "—",
 * dinheiro, pessoas, ações do admin, allowedActions por estado e permissão, e nada de PIN, CPF ou e-mail.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { fakeObjectId } from './helpers/ids';
import { createOpsStore, createOpsOrder, cleanupOpsFixtures, grantRolePermissions, OpsOrderInput } from './helpers/d3b1Ops';

const DOMAIN = '@d3b1p15.test';
const MARK = 'd3b1p15';
const PIN_ENTREGA = '73914';
const PIN_RETIRADA = '82605';
const CPF = '39053344705';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let ceo: TestUser;
let cliente: TestUser;
let motoboy: TestUser;
let storeId: string;
let T0: Date;

beforeEach(async () => {
  T0 = new Date(Date.now() - 60 * 60_000);
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: CPF } });
  motoboy = await createTestUser('motoboy', DOMAIN);
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Detalhe' });
});
afterEach(async () => {
  await cleanupOpsFixtures(DOMAIN, MARK);
});

const plus = (m: number) => new Date(T0.getTime() + m * 60_000);
const order = (data: Partial<OpsOrderInput>) => createOpsOrder({ customerId: cliente.userId, storeId, ...data });
const get = (u: TestUser | undefined, id: string) => {
  const r = request(app).get(`/api/admin/orders/${id}`);
  return u ? r.set('Authorization', bearer(u)) : r;
};

/** Pedido de custódia pago, aceito e com motoboy atribuído (ainda não retirado). */
async function assignedOrder() {
  const product = await prisma.product.create({ data: { storeId, name: 'Pizza Grande', price: 50, quantity: 10 } });
  return order({
    status: 'aguardando_motoboy', totalValue: 110, deliveryFee: 10, subtotal: 100, storeAmount: 90, commissionDelivery: 2,
    createdAt: T0, paidAt: plus(2), acceptedAt: plus(5),
    items: [{ productId: product.id, quantity: 2, price: 50 }],
    delivery: {
      status: 'assigned', motoboyId: motoboy.userId, createdAt: plus(6), assignedAt: plus(9),
      pin: PIN_ENTREGA, pinRetirada: PIN_RETIRADA,
    },
  });
}

describe('GET /api/admin/orders/:id', () => {
  it('detalhe completo do pedido, sem PIN, CPF nem e-mail', async () => {
    const o = await assignedOrder();
    const r = await get(ceo, o.orderId);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: o.orderId,
      shortId: o.orderId.slice(-6),
      status: 'aguardando_motoboy',
      deliveryStatus: 'assigned',
      settlementMode: 'custody',
      store: { id: storeId, name: 'Loja Detalhe' },
      customer: { id: cliente.userId, name: 'User cliente', ordersCount: 1, cancellations30d: 0 },
      motoboy: { id: motoboy.userId, name: 'User motoboy', vehicle: null, plate: 'ABC1D23', rating: null },
      adminActions: [],
      items: [{ name: 'Pizza Grande', quantity: 2, unitPrice: 50, total: 100 }],
      money: {
        subtotal: 100, deliveryFee: 10, couponDiscount: 0, walletApplied: 0, paidByCustomer: 110,
        storeShare: 90, motoboyShare: 8, platformShare: 12, payouts: [], motoboyTransfer: null,
      },
      cancellation: null,
      refundPending: false,
      allowedActions: ['cancel', 'reassign'],
    });
    expect(r.body.timeline).toEqual([
      { key: 'created', at: T0.toISOString(), sincePrevMin: null },
      { key: 'paid', at: plus(2).toISOString(), sincePrevMin: 2 },
      { key: 'accepted', at: plus(5).toISOString(), sincePrevMin: 3 },
      { key: 'assigned', at: plus(9).toISOString(), sincePrevMin: 4 },
      { key: 'picked', at: null, sincePrevMin: null },
      { key: 'delivered', at: null, sincePrevMin: null },
    ]);

    const email = (await prisma.user.findUnique({ where: { id: cliente.userId } }))!.email;
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(PIN_ENTREGA);
    expect(text).not.toContain(PIN_RETIRADA);
    expect(text).not.toContain(CPF);
    expect(text).not.toContain(email);
    expect(text).not.toMatch(/"pin|"cpf"|"email"/);
  });

  it('allowedActions por estado e por permissão', async () => {
    const atribuido = await assignedOrder();
    const retirado = await order({
      status: 'aguardando_motoboy', acceptedAt: plus(1),
      delivery: { status: 'picked', motoboyId: motoboy.userId, createdAt: plus(2), assignedAt: plus(3), pickedAt: plus(4) },
    });
    const entregue = await order({
      status: 'entregue', acceptedAt: plus(1),
      delivery: { status: 'delivered', motoboyId: motoboy.userId, createdAt: plus(2), assignedAt: plus(3), pickedAt: plus(4), deliveredAt: plus(20) },
    });
    const cancelado = await order({ status: 'cancelado', cancelledAt: plus(3) });

    expect((await get(ceo, retirado.orderId)).body.allowedActions).toEqual(['cancel']);
    expect((await get(ceo, entregue.orderId)).body.allowedActions).toEqual([]);
    expect((await get(ceo, cancelado.orderId)).body.allowedActions).toEqual([]);

    // devolução à loja esperando confirmação: sem 'cancel' (daria 409 RETURN_IN_PROGRESS)
    const devolvendo = await order({
      status: 'aguardando_motoboy', acceptedAt: plus(1),
      delivery: { status: 'picked', motoboyId: motoboy.userId, createdAt: plus(2), assignedAt: plus(3), pickedAt: plus(4) },
    });
    await prisma.delivery.update({ where: { id: devolvendo.deliveryId! }, data: { statusDevolucao: 'aguardando_confirmacao' } });
    expect((await get(ceo, devolvendo.orderId)).body.allowedActions).toEqual([]);

    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const casos: Array<[string[], string[]]> = [
      [['operation:view'], []],
      [['operation:view', 'order:reassign'], ['reassign']],
      [['operation:view', 'order:admin_cancel'], ['cancel']],
      [['operation:view', 'order:admin_cancel', 'order:reassign'], ['cancel', 'reassign']],
    ];
    for (const [perms, expected] of casos) {
      const restore = await grantRolePermissions('gerente_geral', perms);
      try {
        const r = await get(gerente, atribuido.orderId);
        expect(r.status).toBe(200);
        expect(r.body.allowedActions).toEqual(expected);
      } finally {
        await restore();
      }
    }
  });

  it('cancelado pelo admin: a linha do tempo termina em cancelado, com culpa, autor, ações e estorno pendente', async () => {
    const o = await order({ status: 'cancelado', createdAt: T0, paidAt: plus(1), cancelledAt: plus(4) });
    await prisma.cancellation.create({
      data: {
        orderId: o.orderId, cancelledBy: 'admin', faultParty: 'platform', adminId: ceo.userId,
        reason: 'Sistema caiu', reasonCode: 'other', refundAmount: 30, refundStatus: 'pending', createdAt: plus(4),
      },
    });
    await prisma.adminOrderAction.create({
      data: { orderId: o.orderId, action: 'cancel', actorId: ceo.userId, actorRole: 'ceo', reason: 'Sistema caiu', faultParty: 'platform', createdAt: plus(4) },
    });

    const r = await get(ceo, o.orderId);
    expect(r.status).toBe(200);
    expect(r.body.timeline.map((s: any) => s.key)).toEqual(['created', 'paid', 'accepted', 'assigned', 'picked', 'cancelled']);
    expect(r.body.timeline[5]).toEqual({ key: 'cancelled', at: plus(4).toISOString(), sincePrevMin: 3 });
    expect(r.body.cancellation).toEqual({
      cancelledBy: 'admin', faultParty: 'platform', reason: 'Sistema caiu', adminName: 'User ceo',
      at: plus(4).toISOString(), refundStatus: 'pending',
    });
    expect(r.body.adminActions).toHaveLength(1);
    expect(r.body.adminActions[0]).toMatchObject({ action: 'cancel', actorName: 'User ceo', reason: 'Sistema caiu', faultParty: 'platform' });
    expect(r.body.adminActions[0].at).toMatch(ISO);
    expect(r.body.refundPending).toBe(true);
    expect(r.body.allowedActions).toEqual([]);
  });

  it('dinheiro: modo direto com Pix ao motoboy; custódia com os repasses do pedido', async () => {
    const direto = await order({ status: 'entregue', paymentProvider: 'asaas_loja', totalValue: 33.33, deliveryFee: 7.77 });
    await prisma.motoboyTransfer.create({
      data: {
        deliveryId: fakeObjectId(), orderId: direto.orderId, storeId, motoboyId: motoboy.userId,
        amount: 7.77, pixKeyEncrypted: 'x', pixKeyType: 'cpf', status: 'done', reason: 'delivery',
      },
    });
    const rd = await get(ceo, direto.orderId);
    expect(rd.body.settlementMode).toBe('direct');
    expect(rd.body.money).toMatchObject({
      paidByCustomer: 33.33, storeShare: 25.56, motoboyShare: 7.77, platformShare: 0,
      motoboyTransfer: { status: 'done', amount: 7.77 },
    });

    const custodia = await order({ status: 'entregue', totalValue: 110, deliveryFee: 10, storeAmount: 90, commissionDelivery: 2 });
    const payout = await prisma.payout.create({
      data: { recipientType: 'store', recipientId: storeId, orderId: custodia.orderId, amount: 90, status: 'pending' },
    });
    const rc = await get(ceo, custodia.orderId);
    expect(rc.body.money.payouts).toEqual([{ id: payout.id, recipientType: 'store', amount: 90, status: 'pending' }]);
    expect(rc.body.money.motoboyTransfer).toBeNull();

    const naoPago = await order({ status: 'criado', paymentStatus: 'pending', paidAt: null, totalValue: 45, deliveryFee: 5, subtotal: 50 });
    const rn = await get(ceo, naoPago.orderId);
    expect(rn.body.money).toMatchObject({
      subtotal: 50, deliveryFee: 5, couponDiscount: 10, paidByCustomer: 45, storeShare: null, motoboyShare: null, platformShare: null,
    });
  });

  it('cliente: nº de pedidos e cancelamentos de 30 dias pela culpa; motoboy: nota média', async () => {
    const pedidos = await Promise.all([1, 2, 3, 4].map(() => order({ status: 'cancelado' })));
    const cancel = (orderId: string, data: Record<string, unknown>) =>
      prisma.cancellation.create({ data: { orderId, reason: 'x', reasonCode: 'other', ...data } as any });
    await cancel(pedidos[0].orderId, { cancelledBy: 'customer' });
    await cancel(pedidos[1].orderId, { cancelledBy: 'admin', faultParty: 'customer' });
    await cancel(pedidos[2].orderId, { cancelledBy: 'admin', faultParty: 'store' });
    await cancel(pedidos[3].orderId, { cancelledBy: 'customer', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60_000) });

    const avaliado = await order({
      status: 'entregue',
      delivery: { status: 'delivered', motoboyId: motoboy.userId, assignedAt: plus(1), pickedAt: plus(2), deliveredAt: plus(3), rating: 4 },
    });
    await order({
      status: 'entregue',
      delivery: { status: 'delivered', motoboyId: motoboy.userId, assignedAt: plus(1), pickedAt: plus(2), deliveredAt: plus(3), rating: 5 },
    });

    const r = await get(ceo, avaliado.orderId);
    expect(r.body.customer).toEqual({ id: cliente.userId, name: 'User cliente', ordersCount: 6, cancellations30d: 2 });
    expect(r.body.motoboy.rating).toBe(4.5);
  });

  it('pedido inexistente → 404 ORDER_NOT_FOUND; sem login → 401; sem operation:view → 403; com a permissão → 200', async () => {
    const missing = await get(ceo, 'nao-existe');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Pedido não encontrado', code: 'ORDER_NOT_FOUND' });

    const o = await assignedOrder();
    expect((await get(undefined, o.orderId)).status).toBe(401);
    const semPermissao = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(semPermissao, o.orderId)).status).toBe(403);
    const marketing = await createTestUser('marketing', DOMAIN);
    const restore = await grantRolePermissions('marketing', ['operation:view']);
    try {
      const r = await get(marketing, o.orderId);
      expect(r.status).toBe(200);
      expect(r.body.allowedActions).toEqual([]);
    } finally {
      await restore();
    }
  });

  it('refundPending: direto pelo DirectRefund; custódia por failed; sem valor a estornar não conta', async () => {
    const refund = (orderId: string, status: string) =>
      prisma.directRefund.create({
        data: { orderId, storeId, asaasPaymentId: 'pay_x', amount: 10, status, requestedBy: ceo.userId },
      });
    const dPendente = await order({ status: 'cancelado', paymentProvider: 'asaas_loja', cancelledAt: plus(1) });
    await refund(dPendente.orderId, 'pending');
    const dFeito = await order({ status: 'cancelado', paymentProvider: 'asaas_loja', cancelledAt: plus(1) });
    await refund(dFeito.orderId, 'done');
    expect((await get(ceo, dPendente.orderId)).body.refundPending).toBe(true);
    expect((await get(ceo, dFeito.orderId)).body.refundPending).toBe(false);

    const cancel = (orderId: string, data: Record<string, unknown>) =>
      prisma.cancellation.create({ data: { orderId, cancelledBy: 'admin', reason: 'x', reasonCode: 'other', ...data } as any });
    const cFalhou = await order({ status: 'cancelado', cancelledAt: plus(1) });
    await cancel(cFalhou.orderId, { refundAmount: 20, refundStatus: 'failed' });
    const cZero = await order({ status: 'cancelado', cancelledAt: plus(1) });
    await cancel(cZero.orderId, { refundAmount: 0 });
    expect((await get(ceo, cFalhou.orderId)).body.refundPending).toBe(true);
    expect((await get(ceo, cZero.orderId)).body.refundPending).toBe(false);
  });

  it('dinheiro sensível pede permissão: só operation:view não vê repasses, Pix ao motoboy nem as partes do dinheiro', async () => {
    const o = await order({ status: 'entregue', totalValue: 110, deliveryFee: 10, storeAmount: 90, commissionDelivery: 2 });
    await prisma.payout.create({ data: { recipientType: 'store', recipientId: storeId, orderId: o.orderId, amount: 90, status: 'pending' } });
    await prisma.motoboyTransfer.create({
      data: {
        deliveryId: fakeObjectId(), orderId: o.orderId, storeId, motoboyId: motoboy.userId,
        amount: 8, pixKeyEncrypted: 'x', pixKeyType: 'cpf', status: 'done', reason: 'delivery',
      },
    });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['operation:view']);
    try {
      const r = await get(gerente, o.orderId);
      expect(r.status).toBe(200);
      expect(r.body.money).toMatchObject({ payouts: [], motoboyTransfer: null, storeShare: null, motoboyShare: null, platformShare: null, paidByCustomer: 110 });
    } finally {
      await restore();
    }
    const rc = await get(ceo, o.orderId);
    expect(rc.body.money.payouts).toHaveLength(1);
    expect(rc.body.money.motoboyTransfer).toEqual({ status: 'done', amount: 8 });
    expect(rc.body.money).toMatchObject({ storeShare: 90, motoboyShare: 8 });
    expect(rc.body.money.platformShare).not.toBeNull();
  });
});
