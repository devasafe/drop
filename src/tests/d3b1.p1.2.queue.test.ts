/**
 * D3b-1 · P1.2 — GET /admin/queue ("Precisa de mim", spec 3.1).
 * As contagens são conferidas por diferença (antes × depois), porque o banco de teste é
 * compartilhado e a fila é global.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { fakeObjectId } from './helpers/ids';
import {
  createOpsStore, createOpsOrder, cleanupOpsFixtures, grantRolePermissions, minutesBefore, OpsOrderInput,
} from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { buildQueue, QUEUE_LOADERS, QUEUE_TYPES } from '../services/adminOps/queue';
import { QueueResponse, QueueType } from '../services/adminOps/types';

const DOMAIN = '@d3b1p12.test';
const MARK = 'd3b1p12';
const LIMITS = { storeAcceptTimeoutMin: 10, poolTimeoutMin: 15 };
const ALL_TYPES: QueueType[] = [
  'refund', 'withdrawal', 'motoboy_transfer', 'verification', 'support',
  'payout', 'plan_change', 'order_no_motoboy', 'order_store_late',
];
const GROUP_ORDER = ['customer_money', 'person_waiting', 'revenue', 'operation'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let restoreConfig: () => Promise<void>;
let ceo: TestUser;
let cliente: TestUser;
let motoboy: TestUser;
let storeId: string;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ storeAcceptTimeoutMin: 10, poolTimeoutMin: 15 }, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Fila' });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupOpsFixtures(DOMAIN, MARK);
});

const allowAll = () => true;
const countOf = (q: QueueResponse, type: QueueType) => q.groups.find((g) => g.type === type)?.count ?? 0;
const deltas = (a: QueueResponse, b: QueueResponse) =>
  Object.fromEntries(ALL_TYPES.map((t) => [t, countOf(b, t) - countOf(a, t)]));
const get = (u?: TestUser) => {
  const r = request(app).get('/api/admin/queue');
  return u ? r.set('Authorization', bearer(u)) : r;
};
const order = (data: Partial<OpsOrderInput>) => createOpsOrder({ customerId: cliente.userId, storeId, ...data });
const ticket = (data: { status?: 'aberto' | 'em_atendimento' | 'resolvido'; assignedTo?: { userId: string; name: string }[] }) =>
  prisma.supportTicket.create({
    data: {
      conversationId: `${MARK}-${fakeObjectId()}`,
      openedBy: { userId: cliente.userId, role: 'cliente', name: 'Cliente' },
      category: 'clientes',
      subject: 'Pedido não chegou',
      status: data.status ?? 'aberto',
      ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
    },
  });

/** Cria o que cada tipo deve contar (e o que não deve) e devolve o delta esperado. */
async function seedQueue(now: Date) {
  // refund: DirectRefund falho + estorno de custódia falho (= 2)
  const direto1 = await order({ status: 'cancelado', paymentStatus: 'refunded', paymentProvider: 'asaas_loja' });
  await prisma.directRefund.create({
    data: { orderId: direto1.orderId, storeId, asaasPaymentId: `pay_${fakeObjectId()}`, amount: 25, status: 'failed', requestedBy: ceo.userId },
  });
  const direto2 = await order({ status: 'cancelado', paymentStatus: 'refunded', paymentProvider: 'asaas_loja' });
  await prisma.directRefund.create({
    data: { orderId: direto2.orderId, storeId, asaasPaymentId: `pay_${fakeObjectId()}`, amount: 25, status: 'done', requestedBy: ceo.userId },
  });
  // pedido direto: a Cancellation pendente não conta (quem conta é o DirectRefund)
  await prisma.cancellation.create({
    data: { orderId: direto2.orderId, cancelledBy: 'customer', reason: 'x', reasonCode: 'customer_request', refundAmount: 25, refundStatus: 'pending' },
  });
  const custodia = await order({ status: 'cancelado' });
  await prisma.cancellation.create({
    data: { orderId: custodia.orderId, cancelledBy: 'store', reason: 'x', reasonCode: 'store_rejected', refundAmount: 30, refundStatus: 'failed' },
  });
  const semValor = await order({ status: 'cancelado' });
  await prisma.cancellation.create({
    data: { orderId: semValor.orderId, cancelledBy: 'customer', reason: 'x', reasonCode: 'customer_request', refundAmount: 0, refundStatus: 'pending' },
  });

  // withdrawal: pendente + aprovado incerto (= 2)
  const wr = (data: Record<string, unknown>) =>
    prisma.withdrawalRequest.create({
      data: { motoboyId: motoboy.userId, motoboyName: 'Bruno', motoboyEmail: `bruno${DOMAIN}`, amount: 10, ...data } as any,
    });
  await wr({ status: 'pending' });
  await wr({ status: 'approved', approvedAt: now, uncertainAt: now });
  await wr({ status: 'approved', approvedAt: now }); // em voo, sem incerteza: não conta
  await wr({ status: 'processed', processedAt: now }); // pago: não conta

  // motoboy_transfer: failed + failed_final + Pix manual do DROP não pago (= 3)
  const mt = (status: string, payer: 'store' | 'platform' = 'store', lastError: string | null = null) =>
    prisma.motoboyTransfer.create({
      data: { deliveryId: fakeObjectId(), orderId: fakeObjectId(), storeId, motoboyId: motoboy.userId, amount: 8, pixKeyEncrypted: 'x', pixKeyType: 'cpf', status, payer, lastError },
    });
  await mt('failed');
  await mt('failed_final');
  await mt('done');
  await mt('pending'); // da loja, em andamento: não conta
  await mt('failed_final', 'platform', 'PLATFORM_MANUAL_PIX'); // Pix manual do DROP ainda não pago
  await mt('done', 'platform', 'PLATFORM_MANUAL_PIX'); // o DROP já pagou ("Resolver"): não conta

  // verification: documento do cliente + CNH/placa do motoboy (= 2)
  const doc = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: doc.userId }, data: { verification: { document: { status: 'pending' } } } });
  const courier = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: courier.userId }, data: { verification: { courier: { status: 'pending' } } } });

  // support: aberto com assignedTo [] e aberto sem assignedTo (= 2)
  await ticket({ assignedTo: [] });
  await ticket({});
  await ticket({ assignedTo: [{ userId: ceo.userId, name: 'CEO' }] }); // já tem quem atenda
  await ticket({ status: 'resolvido' });

  // payout: pendente pronto + pendente bloqueado (= 2)
  const payout = (data: Record<string, unknown>) =>
    prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 5, ...data } as any });
  await payout({ status: 'pending' });
  await payout({ status: 'pending', blocked: true, blockReason: 'teste' });
  await payout({ status: 'released' });

  // plan_change (= 1)
  await prisma.storeSubscription.create({
    data: { storeId, storeName: 'Loja Fila', currentPlan: 'plan1', requestedPlan: 'plan2', planChangeStatus: 'pending', requestedAt: now },
  });
  const otherStore = await createOpsStore(DOMAIN, { name: 'Loja Sem Troca' });
  await prisma.storeSubscription.create({ data: { storeId: otherStore, storeName: 'Loja Sem Troca' } });

  // order_no_motoboy: pool vencido + decidindo com pool vencido (um só) + decidindo sem entrega (= 3)
  const stale = minutesBefore(now, LIMITS.poolTimeoutMin + 5);
  await order({ status: 'aguardando_motoboy', acceptedAt: stale, delivery: { status: 'pending', createdAt: stale } });
  await order({ status: 'aguardando_motoboy', acceptedAt: stale, awaitingCustomerPoolDecision: true, delivery: { status: 'pending', createdAt: stale } });
  await order({ status: 'aguardando_motoboy', acceptedAt: stale, awaitingCustomerPoolDecision: true });
  await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'pending', createdAt: minutesBefore(now, 1) } }); // pool recente
  await order({ status: 'cancelado', delivery: { status: 'pending', createdAt: stale } }); // pedido já encerrado

  // order_store_late: pago há mais do prazo + pago sem paidAt criado há mais do prazo (= 2)
  const late = minutesBefore(now, LIMITS.storeAcceptTimeoutMin + 5);
  await order({ status: 'pago', createdAt: late, paidAt: late });
  await order({ status: 'criado', createdAt: late, paidAt: null });
  await order({ status: 'pago', createdAt: minutesBefore(now, 3) }); // dentro do prazo
  await order({ status: 'pago', createdAt: late, paidAt: late, acceptedAt: minutesBefore(now, 1) }); // já aceito

  return {
    refund: 2, withdrawal: 2, motoboy_transfer: 3, verification: 2, support: 2,
    payout: 2, plan_change: 1, order_no_motoboy: 3, order_store_late: 2,
  };
}

describe('buildQueue', () => {
  it('cada tipo aparece com a contagem certa', async () => {
    const now = new Date();
    const before = await buildQueue({ now, limits: LIMITS, can: allowAll });
    const expected = await seedQueue(now);
    const after = await buildQueue({ now, limits: LIMITS, can: allowAll });
    expect(deltas(before, after)).toEqual(expected);
    expect(after.groups.map((g) => g.type).sort()).toEqual([...ALL_TYPES].sort());
    expect(after.groups.every((g) => g.error === undefined)).toBe(true);
    expect(JSON.stringify(after)).not.toContain(`bruno${DOMAIN}`);
  });

  it('itens: no máximo 5, os mais antigos primeiro, no formato combinado', async () => {
    const old = new Date('2000-01-01T00:00:00.000Z');
    for (let i = 0; i < 6; i++) {
      await prisma.withdrawalRequest.create({
        data: {
          motoboyId: motoboy.userId, motoboyName: `Bruno ${i}`, motoboyEmail: `bruno${i}${DOMAIN}`,
          amount: 10 + i, requestedAt: new Date(old.getTime() + i * 60_000),
        },
      });
    }
    const q = await buildQueue({ now: new Date(), limits: LIMITS, can: allowAll });
    const w = q.groups.find((g) => g.type === 'withdrawal')!;
    expect(w.group).toBe('person_waiting');
    expect(w.items).toHaveLength(5);
    expect(w.items.map((i) => i.title)).toEqual(['Saque de Bruno 0', 'Saque de Bruno 1', 'Saque de Bruno 2', 'Saque de Bruno 3', 'Saque de Bruno 4']);
    for (const item of w.items) {
      expect(Object.keys(item).sort()).toEqual(['context', 'href', 'id', 'since', 'tag', 'title']);
      expect(item.since).toMatch(ISO);
      expect(item.tag).toBe('Esperando');
      expect(item.href).toBe('/admin/withdrawals');
      expect(item.id).toMatch(/^wr:/);
    }
    expect(w.items[0].context).toBe('R$ 10,00 · esperando aprovação');
  });

  it('Pix manual do DROP ao motoboy: aparece até ser pago; depois do "Resolver" (done) sai', async () => {
    const t = await prisma.motoboyTransfer.create({
      data: {
        deliveryId: fakeObjectId(), orderId: fakeObjectId(), storeId, motoboyId: motoboy.userId, amount: 12.5,
        pixKeyEncrypted: 'x', pixKeyType: 'cpf', status: 'failed_final', lastError: 'PLATFORM_MANUAL_PIX',
        payer: 'platform', reason: 'compensation',
        createdAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    const before = await buildQueue({ now: new Date(), limits: LIMITS, can: allowAll });
    const item = before.groups.find((g) => g.type === 'motoboy_transfer')!.items.find((i) => i.id === `mt:${t.id}`);
    expect(item).toMatchObject({ title: 'Pix manual do DROP ao motoboy', tag: 'Urgente', href: '/admin/transfers' });
    expect(item!.context).toContain('R$ 12,50');

    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { status: 'done', doneAt: new Date() } });
    const after = await buildQueue({ now: new Date(), limits: LIMITS, can: allowAll });
    expect(countOf(before, 'motoboy_transfer') - countOf(after, 'motoboy_transfer')).toBe(1);
    expect(after.groups.find((g) => g.type === 'motoboy_transfer')!.items.some((i) => i.id === `mt:${t.id}`)).toBe(false);
  });

  it('grupos na ordem combinada; dentro do grupo, o item mais antigo primeiro', async () => {
    await seedQueue(new Date());
    const q = await buildQueue({ now: new Date(), limits: LIMITS, can: allowAll });
    const groupIdx = q.groups.map((g) => GROUP_ORDER.indexOf(g.group));
    expect(groupIdx).toEqual([...groupIdx].sort((a, b) => a - b));
    const groupOf = Object.fromEntries(QUEUE_TYPES.map((d) => [d.type, d.group]));
    expect(Object.fromEntries(q.groups.map((g) => [g.type, g.group]))).toEqual(groupOf);
    const oldest = (items: { since: string }[]) => (items.length ? items.map((i) => i.since).sort()[0] : '9999');
    for (let i = 1; i < q.groups.length; i++) {
      if (q.groups[i].group !== q.groups[i - 1].group) continue;
      expect(oldest(q.groups[i - 1].items) <= oldest(q.groups[i].items)).toBe(true);
    }
  });
});

describe('GET /api/admin/queue', () => {
  it('um tipo que lança erro não derruba os outros', async () => {
    jest.spyOn(QUEUE_LOADERS, 'withdrawal').mockRejectedValueOnce(new Error('banco caiu'));
    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(r.body.groups).toHaveLength(9);
    const w = r.body.groups.find((g: any) => g.type === 'withdrawal');
    expect(w).toEqual({ type: 'withdrawal', group: 'person_waiting', count: 0, items: [], error: 'Não deu para carregar saques' });
    expect(r.body.groups.filter((g: any) => g.error)).toHaveLength(1);
  });

  it('tipo sem permissão não vem; verificação conta só o que a pessoa revisa', async () => {
    const gerente = await createTestUser('gerente_motoboys', DOMAIN);
    const restore = await grantRolePermissions('gerente_motoboys', ['operation:view', 'verification:review_motoboys']);
    try {
      const beforeGerente = await get(gerente);
      const beforeCeo = await get(ceo);
      const doc = await createTestUser('cliente', DOMAIN);
      await prisma.user.update({ where: { id: doc.userId }, data: { verification: { document: { status: 'pending' } } } });
      const courier = await createTestUser('motoboy', DOMAIN);
      await prisma.user.update({ where: { id: courier.userId }, data: { verification: { courier: { status: 'pending' } } } });

      const r = await get(gerente);
      expect(r.status).toBe(200);
      expect(r.body.groups.map((g: any) => g.type).sort()).toEqual(['order_no_motoboy', 'order_store_late', 'verification']);
      expect(countOf(r.body, 'verification') - countOf(beforeGerente.body, 'verification')).toBe(1);
      const ceoAfter = await get(ceo);
      expect(countOf(ceoAfter.body, 'verification') - countOf(beforeCeo.body, 'verification')).toBe(2);
    } finally {
      await restore();
    }
  });

  it('sem login → 401; sem operation:view → 403; com operation:view concedida a um gerente → 200', async () => {
    expect((await get()).status).toBe(401);
    const semPermissao = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(semPermissao)).status).toBe(403);
    const marketing = await createTestUser('marketing', DOMAIN);
    const restore = await grantRolePermissions('marketing', ['operation:view']);
    try {
      const r = await get(marketing);
      expect(r.status).toBe(200);
      expect(r.body.groups.map((g: any) => g.type).sort()).toEqual(['order_no_motoboy', 'order_store_late']);
    } finally {
      await restore();
    }
  });
});
