/**
 * D3b-3 · P3.2 — GET /admin/money/summary (spec 7.1 e 7.3).
 * Os números são conferidos por diferença (antes × depois), porque o banco de teste é
 * compartilhado e o resumo é global. As contas do dia usam um `now` fixo em 2031.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { fakeObjectId } from './helpers/ids';
import { createMoneyStore, createMoneyOrder, createCashboxEntry, cleanupMoneyFixtures } from './helpers/d3b3Money';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import {
  getMoneySummary,
  splitPaidOrder,
  saoPauloDayRange,
  toCents,
  MoneySummary,
  PaidOrderSplitInput,
} from '../services/moneyOverview.service';

const DOMAIN = '@d3b3p32.test';
const MARK = 'd3b3p32';
let restoreConfig: () => Promise<void>;
let ceo: TestUser;
let cliente: TestUser;
let motoboy: TestUser;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'custodia', motoboyShareDirect: 80, motoboyCommissionPercent: 20 }, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
});
afterEach(async () => {
  await cleanupMoneyFixtures(DOMAIN, MARK);
});

const FLOW_KEYS = ['inFromCustomers', 'toStores', 'toMotoboys', 'gatewayCost', 'platform'] as const;
const flowDelta = (a: MoneySummary, b: MoneySummary) =>
  Object.fromEntries(FLOW_KEYS.map((k) => [k, toCents(b.whereMoneyWent[k]) - toCents(a.whereMoneyWent[k])]));
const closes = (s: MoneySummary) => {
  const f = s.whereMoneyWent;
  return toCents(f.toStores) + toCents(f.toMotoboys) + toCents(f.gatewayCost) + toCents(f.platform) === toCents(f.inFromCustomers);
};

describe('splitPaidOrder (centavos)', () => {
  const base: PaidOrderSplitInput = {
    direct: false, totalValue: 0, deliveryFee: 0, walletApplied: 0, cardChargedTotal: null,
    storeAmount: 0, commissionDelivery: 0, motoboyTransfer: null, motoboyShareDirect: 100,
  };
  const cases: Array<[string, PaidOrderSplitInput, Record<string, number>]> = [
    ['custódia Pix: loja, motoboy e a plataforma fica com o resto',
      { ...base, totalValue: 110, deliveryFee: 10, storeAmount: 90, commissionDelivery: 2 },
      { inFromCustomers: 11000, toStores: 9000, toMotoboys: 800, gatewayCost: 0, platform: 1200 }],
    ['custódia cartão com saldo e cupom global: custo do gateway = acréscimo do cartão',
      { ...base, totalValue: 45, walletApplied: 20, cardChargedTotal: 26.03, storeAmount: 42.5 },
      { inFromCustomers: 4603, toStores: 4250, toMotoboys: 0, gatewayCost: 103, platform: 250 }],
    ['direto com Pix ao motoboy: loja fica com o resto; plataforma e gateway zero',
      { ...base, direct: true, totalValue: 33.33, deliveryFee: 7.77, motoboyTransfer: 7.77 },
      { inFromCustomers: 3333, toStores: 2556, toMotoboys: 777, gatewayCost: 0, platform: 0 }],
    ['direto sem Pix ainda: motoboy pela fatia configurada, arredondada em centavos',
      { ...base, direct: true, totalValue: 30, deliveryFee: 7.77, motoboyShareDirect: 33 },
      { inFromCustomers: 3000, toStores: 2744, toMotoboys: 256, gatewayCost: 0, platform: 0 }],
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    const out = splitPaidOrder(input);
    expect(out).toEqual(expected);
    expect(out.toStores + out.toMotoboys + out.gatewayCost + out.platform).toBe(out.inFromCustomers);
  });
});

describe('getMoneySummary', () => {
  it('"Para onde foi" soma os pedidos pagos no dia de São Paulo e fecha em centavos', async () => {
    const now = new Date('2031-03-12T15:00:00.000Z');
    const paidAt = new Date('2031-03-12T14:00:00.000Z');
    const storeId = await createMoneyStore(DOMAIN, { name: 'Loja Fluxo', plan: 2 });
    await prisma.storeSubscription.create({ data: { storeId, storeName: 'Loja Fluxo', commissionRate: 10 } });
    const pedido = (data: Partial<Parameters<typeof createMoneyOrder>[0]> & { totalValue: number }) =>
      createMoneyOrder({ customerId: cliente.userId, storeId, paidAt, ...data });

    const before = await getMoneySummary(now);

    // A: custódia Pix
    await pedido({ totalValue: 110, deliveryFee: 10, storeAmount: 90, commissionDelivery: 2 });
    // B: custódia cartão (R$ 20 de saldo + R$ 25 no cartão grosseado para 26,03), cupom global de 5
    await pedido({ totalValue: 45, subtotal: 50, walletApplied: 20, cardChargedTotal: 26.03, storeAmount: 42.5, commissionDelivery: 0 });
    // C: direto, Pix ao motoboy já criado
    const c = await pedido({ paymentProvider: 'asaas_loja', totalValue: 33.33, deliveryFee: 7.77, storeAmount: 33.33, commissionDelivery: 0 });
    await prisma.motoboyTransfer.create({
      data: { deliveryId: fakeObjectId(), orderId: c, storeId, motoboyId: motoboy.userId, amount: 7.77, pixKeyEncrypted: 'x', pixKeyType: 'cpf', status: 'done', reason: 'delivery' },
    });
    // D: direto sem Pix ainda (fatia de 80%)
    await pedido({ paymentProvider: 'asaas_loja', totalValue: 20, deliveryFee: 5, storeAmount: 20, commissionDelivery: 0 });
    // E: custódia sem retrato (sem walletDistribution e sem Transaction) → calculateOrderDistribution
    await pedido({ totalValue: 45, deliveryFee: 5 });
    // fora: pago às 23:59:59.999 do dia anterior em SP, e pedido não pago
    await pedido({ totalValue: 999, paidAt: new Date('2031-03-12T02:59:59.999Z'), storeAmount: 999, commissionDelivery: 0 });
    await pedido({ totalValue: 777, status: 'criado', paymentStatus: 'pending', paidAt: null });

    const after = await getMoneySummary(now);
    expect(after.day).toBe('2031-03-12');
    expect(after.whereMoneyWent.orders - before.whereMoneyWent.orders).toBe(5);
    expect(flowDelta(before, after)).toEqual({ inFromCustomers: 25436, toStores: 21006, toMotoboys: 2377, gatewayCost: 103, platform: 1950 });
    expect(closes(after)).toBe(true);
  });

  it('o dia é o de São Paulo: 23:59 fica no dia anterior, 00:00 abre o dia novo', async () => {
    const storeId = await createMoneyStore(DOMAIN);
    const lastOfDay = new Date('2031-04-01T02:59:59.999Z'); // 31/03 23:59:59.999 em SP
    const firstOfDay = new Date('2031-04-01T03:00:00.000Z'); // 01/04 00:00 em SP
    const nightNow = new Date('2031-04-01T02:30:00.000Z'); // 31/03 23:30 em SP (já 01/04 em UTC)
    const morningNow = new Date('2031-04-01T12:00:00.000Z'); // 01/04 09:00 em SP

    const n0 = await getMoneySummary(nightNow);
    const m0 = await getMoneySummary(morningNow);

    await createMoneyOrder({ customerId: cliente.userId, storeId, totalValue: 10, paidAt: lastOfDay, storeAmount: 9, commissionDelivery: 0 });
    await createMoneyOrder({ customerId: cliente.userId, storeId, totalValue: 20, paidAt: firstOfDay, storeAmount: 18, commissionDelivery: 0 });
    await createCashboxEntry(MARK, { type: 'income', source: 'product_commission', amount: 1, createdAt: lastOfDay });
    await createCashboxEntry(MARK, { type: 'income', source: 'product_commission', amount: 2, createdAt: firstOfDay });
    const wr = { motoboyId: motoboy.userId, motoboyName: 'Bruno', motoboyEmail: 'b@d3b3p32.test', status: 'processed' as const };
    await prisma.withdrawalRequest.create({ data: { ...wr, amount: 5, processedAt: lastOfDay } });
    await prisma.withdrawalRequest.create({ data: { ...wr, amount: 7, processedAt: firstOfDay } });

    const n1 = await getMoneySummary(nightNow);
    const m1 = await getMoneySummary(morningNow);
    expect(n1.day).toBe('2031-03-31');
    expect(m1.day).toBe('2031-04-01');
    expect(toCents(n1.whereMoneyWent.inFromCustomers) - toCents(n0.whereMoneyWent.inFromCustomers)).toBe(1000);
    expect(toCents(m1.whereMoneyWent.inFromCustomers) - toCents(m0.whereMoneyWent.inFromCustomers)).toBe(2000);
    expect(toCents(n1.platformRevenueToday) - toCents(n0.platformRevenueToday)).toBe(100);
    expect(toCents(m1.platformRevenueToday) - toCents(m0.platformRevenueToday)).toBe(200);
    expect(toCents(n1.withdrawalsToday.amount) - toCents(n0.withdrawalsToday.amount)).toBe(500);
    expect(n1.withdrawalsToday.count - n0.withdrawalsToday.count).toBe(1);
    expect(toCents(m1.withdrawalsToday.amount) - toCents(m0.withdrawalsToday.amount)).toBe(700);
    expect(m1.withdrawalsToday.count - m0.withdrawalsToday.count).toBe(1);
  });

  it('custódia: pedidos em custódia, a liberar (com incertos), saques de hoje e receita da plataforma', async () => {
    const storeId = await createMoneyStore(DOMAIN);
    const now = new Date();
    const elevenMinAgo = new Date(now.getTime() - 11 * 60 * 1000);
    const before = await getMoneySummary(now);

    const pedido = (data: Partial<Parameters<typeof createMoneyOrder>[0]> & { totalValue: number }) =>
      createMoneyOrder({ customerId: cliente.userId, storeId, storeAmount: 0, commissionDelivery: 0, ...data });
    await pedido({ totalValue: 110, status: 'pago' });
    await pedido({ totalValue: 40, status: 'enviado' });
    await pedido({ totalValue: 500, status: 'entregue' }); // fora: entregue
    await pedido({ totalValue: 501, status: 'cancelado' }); // fora: cancelado
    await pedido({ totalValue: 502, status: 'pago', paymentProvider: 'asaas_loja' }); // fora: direto
    await pedido({ totalValue: 503, status: 'criado', paymentStatus: 'pending', paidAt: null }); // fora: não pago

    const payout = (data: Record<string, unknown>) =>
      prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 1, ...data } as any });
    await payout({ amount: 25, status: 'pending' });
    await payout({ amount: 15, status: 'pending' });
    await payout({ amount: 99, status: 'pending', blocked: true, blockReason: 'teste' }); // fora: bloqueado
    await payout({ amount: 10, status: 'releasing', uncertainAt: now }); // incerto
    await payout({ amount: 11, status: 'releasing' }); // em voo agora: ainda não é incerto
    await payout({ amount: 12, status: 'releasing', updatedAt: elevenMinAgo }); // parado há 11 min: incerto

    const wr = (data: Record<string, unknown>) =>
      prisma.withdrawalRequest.create({ data: { motoboyId: motoboy.userId, motoboyName: 'Bruno', motoboyEmail: 'b@d3b3p32.test', amount: 1, ...data } as any });
    await wr({ amount: 50, status: 'processed', processedAt: now });
    await wr({ amount: 9, status: 'pending' });
    await wr({ amount: 8, status: 'approved', approvedAt: now, uncertainAt: now }); // incerto
    await wr({ amount: 7, status: 'approved', approvedAt: elevenMinAgo }); // parado: incerto
    await wr({ amount: 6, status: 'approved', approvedAt: now }); // em voo: não conta

    await createCashboxEntry(MARK, { type: 'income', source: 'product_commission', amount: 8, createdAt: now });
    await createCashboxEntry(MARK, { type: 'income', source: 'delivery_commission', amount: 2, createdAt: now });
    await createCashboxEntry(MARK, { type: 'expense', source: 'product_commission', amount: 3, createdAt: now });
    await createCashboxEntry(MARK, { type: 'income', source: 'order_payment', amount: 100, createdAt: now }); // não é comissão

    const after = await getMoneySummary(now);
    expect(after.mode).toBe('custodia');
    expect(after.refunds).toBeNull();
    expect(after.custody!.count - before.custody!.count).toBe(2);
    expect(toCents(after.custody!.amount) - toCents(before.custody!.amount)).toBe(15000);
    expect(after.toRelease!.count - before.toRelease!.count).toBe(2);
    expect(toCents(after.toRelease!.amount) - toCents(before.toRelease!.amount)).toBe(4000);
    expect(after.toRelease!.uncertain - before.toRelease!.uncertain).toBe(2);
    expect(toCents(after.withdrawalsToday.amount) - toCents(before.withdrawalsToday.amount)).toBe(5000);
    expect(after.withdrawalsToday.count - before.withdrawalsToday.count).toBe(1);
    expect(after.withdrawalsToday.pending - before.withdrawalsToday.pending).toBe(1);
    expect(after.withdrawalsToday.uncertain - before.withdrawalsToday.uncertain).toBe(2);
    expect(toCents(after.platformRevenueToday) - toCents(before.platformRevenueToday)).toBe(700);
    expect(closes(after)).toBe(true);
  });

  it('direto: sem custódia nem "a liberar"; mostra os estornos ainda não concluídos', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' }, 'test');
    const storeId = await createMoneyStore(DOMAIN);
    const before = await getMoneySummary();

    const refund = async (amount: number, status: string) => {
      const orderId = await createMoneyOrder({
        customerId: cliente.userId, storeId, paymentProvider: 'asaas_loja', totalValue: amount, status: 'cancelado', paymentStatus: 'refunded',
      });
      await prisma.directRefund.create({
        data: { orderId, storeId, asaasPaymentId: `pay_${fakeObjectId()}`, amount, status, requestedBy: ceo.userId },
      });
    };
    await refund(12.5, 'pending');
    await refund(7.5, 'failed');
    await refund(100, 'done'); // fora: concluído

    const after = await getMoneySummary();
    expect(after.mode).toBe('direto');
    expect(after.custody).toBeNull();
    expect(after.toRelease).toBeNull();
    expect(after.refunds!.count - before.refunds!.count).toBe(2);
    expect(toCents(after.refunds!.amount) - toCents(before.refunds!.amount)).toBe(2000);
  });
});

describe('GET /api/admin/money/summary', () => {
  const get = (u?: TestUser) => {
    const r = request(app).get('/api/admin/money/summary');
    return u ? r.set('Authorization', bearer(u)) : r;
  };

  it('CEO recebe o resumo no formato combinado', async () => {
    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(
      ['custody', 'day', 'mode', 'platformRevenueToday', 'refunds', 'toRelease', 'whereMoneyWent', 'withdrawalsToday'],
    );
    expect(Object.keys(r.body.whereMoneyWent).sort()).toEqual(
      ['gatewayCost', 'inFromCustomers', 'orders', 'platform', 'toMotoboys', 'toStores'],
    );
    expect(Object.keys(r.body.withdrawalsToday).sort()).toEqual(['amount', 'count', 'pending', 'uncertain']);
    expect(Object.keys(r.body.toRelease).sort()).toEqual(['amount', 'count', 'uncertain']);
    expect(r.body.mode).toBe('custodia');
    expect(r.body.refunds).toBeNull();
    expect(r.body.day).toBe(saoPauloDayRange().day);
  });

  it('sem login → 401; papel sem money:overview → 403', async () => {
    expect((await get()).status).toBe(401);
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(gerente)).status).toBe(403);
  });

  it('papel com money:overview concedido em Permissões → 200', async () => {
    const marketing = await createTestUser('marketing', DOMAIN);
    const previous = await prisma.rolePermissions.findUnique({ where: { role: 'marketing' } });
    try {
      await prisma.rolePermissions.upsert({
        where: { role: 'marketing' },
        create: { role: 'marketing', permissions: ['money:overview'], updatedBy: 'test' },
        update: { permissions: [...(previous?.permissions ?? []), 'money:overview'] },
      });
      expect((await get(marketing)).status).toBe(200);
    } finally {
      if (previous) {
        await prisma.rolePermissions.update({
          where: { role: 'marketing' },
          data: { permissions: previous.permissions, notificationTargets: previous.notificationTargets, updatedBy: previous.updatedBy },
        });
      } else {
        await prisma.rolePermissions.deleteMany({ where: { role: 'marketing' } });
      }
    }
  });
});
