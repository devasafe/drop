/**
 * D3b-3 · P3.3 — GET /admin/money/movements (spec 7.2).
 * Dia fixo 20/05/2031 (São Paulo): só esta suíte tem dados nele.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createWallet } from './helpers/financePg';
import { createMoneyStore, createMoneyOrder, createCashboxEntry, cleanupMoneyFixtures } from './helpers/d3b3Money';
import { ensureAppCashbox } from '../repositories/appCashbox.repository';
import { listMoneyMovements, encodeMoneyCursor, MoneyMovement } from '../services/moneyOverview.service';

const DOMAIN = '@d3b3p33.test';
const MARK = 'd3b3p33';
const NOW = new Date('2031-05-20T15:00:00.000Z'); // 20/05 12:00 em SP
const NEXT_DAY = new Date('2031-05-21T15:00:00.000Z');
const at = (h: number, m: number, s = 0) => new Date(Date.UTC(2031, 4, 20, h, m, s));
let ceo: TestUser;
let cliente: TestUser;
let motoboy: TestUser;

const named = async (role: string, name: string) => {
  const u = await createTestUser(role, DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { name } });
  return u;
};

beforeEach(async () => {
  ceo = await named('ceo', 'Carla CEO');
  cliente = await named('cliente', 'Ana Cliente');
  motoboy = await named('motoboy', 'Bruno Motoboy');
});
afterEach(async () => {
  await cleanupMoneyFixtures(DOMAIN, MARK);
});

async function cenario() {
  const store = await createMoneyStore(DOMAIN, { name: 'Loja Central' });
  const custody = await createMoneyOrder({
    customerId: cliente.userId, storeId: store, totalValue: 110, deliveryFee: 10, paidAt: at(12, 0),
    status: 'cancelado', paymentStatus: 'refunded', storeAmount: 90, commissionDelivery: 2,
  });
  const direct = await createMoneyOrder({
    customerId: cliente.userId, storeId: store, paymentProvider: 'asaas_loja', totalValue: 33.33, paidAt: at(11, 0),
    status: 'cancelado', paymentStatus: 'refunded',
  });
  // fora: pago em 19/05 (SP)
  await createMoneyOrder({ customerId: cliente.userId, storeId: store, totalValue: 5, paidAt: new Date('2031-05-20T02:00:00.000Z') });

  await prisma.payout.create({ data: { recipientType: 'store', recipientId: store, orderId: custody, amount: 90, status: 'released', releasedAt: at(12, 5) } });
  await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: motoboy.userId, orderId: custody, amount: 8, status: 'paid', releasedAt: at(12, 6) } });
  await prisma.payout.create({ data: { recipientType: 'store', recipientId: store, orderId: custody, amount: 1, status: 'pending' } }); // fora

  const wr = { motoboyId: motoboy.userId, motoboyName: 'Bruno Motoboy', motoboyEmail: 'b@d3b3p33.test' };
  await prisma.withdrawalRequest.create({ data: { ...wr, amount: 50, status: 'processed', processedAt: at(12, 10) } });
  await prisma.withdrawalRequest.create({ data: { ...wr, amount: 4, status: 'pending' } }); // fora

  const cancel = { cancelledBy: 'customer' as const, reason: 'teste', reasonCode: 'customer_request' as const, refundStatus: 'processed' as const };
  await prisma.cancellation.create({ data: { ...cancel, orderId: custody, refundAmount: 110, createdAt: at(12, 20), updatedAt: at(12, 20) } });
  // direto: o estorno aparece pelo DirectRefund, não pelo Cancellation
  await prisma.cancellation.create({ data: { ...cancel, orderId: direct, refundAmount: 33.33, createdAt: at(12, 21), updatedAt: at(12, 21) } });
  await prisma.directRefund.create({
    data: { orderId: direct, storeId: store, asaasPaymentId: 'pay_d3b3p33', amount: 33.33, status: 'done', doneAt: at(12, 22), requestedBy: cliente.userId },
  });

  await createCashboxEntry(MARK, { type: 'income', source: 'product_commission', amount: 9, orderId: custody, createdAt: at(12, 30) });
  await createCashboxEntry(MARK, { type: 'expense', source: 'delivery_commission', amount: 1, orderId: custody, createdAt: at(12, 31) });
  await createCashboxEntry(MARK, { type: 'income', source: 'order_payment', amount: 110, orderId: custody, createdAt: at(12, 35) }); // fora
  await createCashboxEntry(MARK, { type: 'deposit', source: 'manual_deposit', amount: 200, createdAt: at(12, 40) });
  const box = await ensureAppCashbox();
  const w = await prisma.withdrawal.create({ data: { appCashboxId: box.id, amount: 70, status: 'approved', requestedBy: ceo.userId, reason: MARK } });
  await createCashboxEntry(MARK, { type: 'withdrawal', source: 'manual_withdrawal', amount: 70, withdrawalId: w.id, createdAt: at(12, 41) });

  const wallet = await createWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
  await prisma.walletEntry.createMany({
    data: [
      { walletId: wallet.id, type: 'credit', category: 'adjustment', amount: 15, reason: 'Ajuste da plataforma: teste', createdAt: at(12, 50) },
      { walletId: wallet.id, type: 'debit', category: 'adjustment', amount: 5, reason: 'Ajuste da plataforma: teste', createdAt: at(12, 51) },
      { walletId: wallet.id, type: 'credit', category: 'payment', amount: 99, reason: 'Venda', createdAt: at(12, 55) }, // fora
    ],
  });
  return { store, custody, direct };
}

const view = (items: MoneyMovement[]) => items.map((i) => [i.at, i.type, i.amount, i.label, i.personName, i.orderId]);

describe('listMoneyMovements', () => {
  it('junta as fontes do dia, mais recente primeiro, com sinal, nome e rótulo', async () => {
    const { custody, direct } = await cenario();
    const page = await listMoneyMovements({}, NOW);
    expect(page.day).toBe('2031-05-20');
    expect(page.nextCursor).toBeNull();
    expect(view(page.items)).toEqual([
      [at(12, 51).toISOString(), 'wallet_adjust', -5, 'Ajuste da plataforma (débito)', 'Bruno Motoboy', null],
      [at(12, 50).toISOString(), 'wallet_adjust', 15, 'Ajuste da plataforma (crédito)', 'Bruno Motoboy', null],
      [at(12, 41).toISOString(), 'cashbox', -70, 'Retirada do caixa', 'Carla CEO', null],
      [at(12, 40).toISOString(), 'cashbox', 200, 'Depósito no caixa', null, null],
      [at(12, 31).toISOString(), 'commission', -1, 'Estorno da comissão de entrega', null, custody],
      [at(12, 30).toISOString(), 'commission', 9, 'Comissão de produto', null, custody],
      [at(12, 22).toISOString(), 'refund', -33.33, 'Estorno ao cliente (conta da loja)', 'Ana Cliente', direct],
      [at(12, 20).toISOString(), 'refund', -110, 'Estorno ao cliente', 'Ana Cliente', custody],
      [at(12, 10).toISOString(), 'withdrawal_paid', -50, 'Saque pago', 'Bruno Motoboy', null],
      [at(12, 6).toISOString(), 'payout_release', -8, 'Repasse liberado ao motoboy', 'Bruno Motoboy', custody],
      [at(12, 5).toISOString(), 'payout_release', -90, 'Repasse liberado à loja', 'Loja Central', custody],
      [at(12, 0).toISOString(), 'order_payment', 110, `Pagamento do pedido #${custody.slice(-6)}`, 'Ana Cliente', custody],
      [at(11, 0).toISOString(), 'order_payment', 33.33, `Pagamento do pedido #${direct.slice(-6)}`, 'Ana Cliente', direct],
    ]);
    expect(new Set(page.items.map((i) => i.id)).size).toBe(13);
  });

  it('filtra por tipo', async () => {
    const { custody, direct } = await cenario();
    const page = await listMoneyMovements({ type: 'refund' }, NOW);
    expect(page.items.map((i) => [i.type, i.orderId, i.amount])).toEqual([
      ['refund', direct, -33.33],
      ['refund', custody, -110],
    ]);
  });

  it('pagina de 50 em 50 pelo cursor, sem repetir nem pular, com horários iguais entre fontes', async () => {
    const store = await createMoneyStore(DOMAIN);
    const box = await ensureAppCashbox();
    const T = at(10, 0);
    await prisma.appCashboxEntry.createMany({
      data: [
        ...Array.from({ length: 40 }, () => ({ appCashboxId: box.id, type: 'deposit' as const, source: 'manual_deposit' as const, amount: 1, reason: MARK, createdAt: T })),
        ...Array.from({ length: 40 }, () => ({ appCashboxId: box.id, type: 'income' as const, source: 'product_commission' as const, amount: 2, reason: MARK, createdAt: T })),
        ...Array.from({ length: 15 }, (_, i) => ({
          appCashboxId: box.id, type: 'deposit' as const, source: 'manual_deposit' as const, amount: 3, reason: MARK,
          createdAt: new Date(T.getTime() - (i + 1) * 1000),
        })),
      ],
    });
    await prisma.order.createMany({
      data: Array.from({ length: 30 }, () => ({
        customerId: cliente.userId, storeId: store, totalValue: 4, deliveryFee: 0, subtotal: 4,
        status: 'pago' as const, paymentStatus: 'paid' as const, paidAt: T,
      })),
    });

    const all: MoneyMovement[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      // a partir da 2ª página o "agora" já é o dia seguinte: o dia vem do cursor
      const page = await listMoneyMovements({ cursor }, i === 0 ? NOW : NEXT_DAY);
      expect(page.day).toBe('2031-05-20');
      sizes.push(page.items.length);
      all.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(sizes).toEqual([50, 50, 25]);
    expect(new Set(all.map((i) => i.id)).size).toBe(125);
    const sorted = [...all].sort((a, b) => b.at.localeCompare(a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    expect(all.map((i) => i.id)).toEqual(sorted.map((i) => i.id));

    const first = await listMoneyMovements({ type: 'cashbox' }, NOW);
    expect(first.items).toHaveLength(50);
    const rest = await listMoneyMovements({ type: 'cashbox', cursor: first.nextCursor! }, NOW);
    expect(rest.items).toHaveLength(5);
    expect(rest.nextCursor).toBeNull();
    expect(new Set([...first.items, ...rest.items].map((i) => i.type))).toEqual(new Set(['cashbox']));
    expect(new Set([...first.items, ...rest.items].map((i) => i.id)).size).toBe(55);
  });

  it('empate de horário cruzando a 51ª linha de uma fonte: cada movimento aparece uma vez, na ordem', async () => {
    const box = await ensureAppCashbox();
    const T = at(9, 0);
    // 48 horários distintos (mais recentes) + 4 linhas com o MESMO instante (as mais antigas): a 51ª cai no empate
    await prisma.appCashboxEntry.createMany({
      data: [
        ...Array.from({ length: 48 }, (_, i) => ({
          appCashboxId: box.id, type: 'deposit' as const, source: 'manual_deposit' as const, amount: 1, reason: MARK,
          createdAt: new Date(T.getTime() + (i + 1) * 1000),
        })),
        ...Array.from({ length: 4 }, () => ({
          appCashboxId: box.id, type: 'deposit' as const, source: 'manual_deposit' as const, amount: 1, reason: MARK, createdAt: T,
        })),
      ],
    });
    const all: MoneyMovement[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 4; i++) {
      const page = await listMoneyMovements({ type: 'cashbox', cursor }, NOW);
      all.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(all).toHaveLength(52);
    expect(new Set(all.map((i) => i.id)).size).toBe(52);
    const sorted = [...all].sort((a, b) => b.at.localeCompare(a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    expect(all.map((i) => i.id)).toEqual(sorted.map((i) => i.id));
  });
});

describe('ramos de nome', () => {
  it('ajuste de carteira de loja e de plataforma, e saque com nome vazio', async () => {
    const store = await createMoneyStore(DOMAIN, { name: 'Loja Ajuste' });
    const platformOwner = `plat_${MARK}`;
    const sw = await createWallet({ owner: store, ownerType: 'store' });
    const pw = await createWallet({ owner: platformOwner, ownerType: 'platform' });
    try {
      await prisma.walletEntry.createMany({
        data: [
          { walletId: sw.id, type: 'credit', category: 'adjustment', amount: 7, reason: 'Ajuste da plataforma: loja', createdAt: at(12, 1) },
          { walletId: pw.id, type: 'debit', category: 'adjustment', amount: 3, reason: 'Ajuste da plataforma: plataforma', createdAt: at(12, 2) },
        ],
      });
      await prisma.withdrawalRequest.create({
        data: { motoboyId: motoboy.userId, motoboyName: '', motoboyEmail: 'v@d3b3p33.test', amount: 6, status: 'processed', processedAt: at(12, 3) },
      });
      const page = await listMoneyMovements({}, NOW);
      expect(view(page.items)).toEqual([
        [at(12, 3).toISOString(), 'withdrawal_paid', -6, 'Saque pago', null, null],
        [at(12, 2).toISOString(), 'wallet_adjust', -3, 'Ajuste da plataforma (débito)', null, null],
        [at(12, 1).toISOString(), 'wallet_adjust', 7, 'Ajuste da plataforma (crédito)', 'Loja Ajuste', null],
      ]);
    } finally {
      await prisma.walletEntry.deleteMany({ where: { walletId: { in: [sw.id, pw.id] } } });
      await prisma.wallet.deleteMany({ where: { id: { in: [sw.id, pw.id] } } });
    }
  });
});

describe('GET /api/admin/money/movements', () => {
  const get = (u: TestUser, qs = '') => request(app).get(`/api/admin/money/movements${qs}`).set('Authorization', bearer(u));

  it('CEO recebe { day, items, nextCursor }', async () => {
    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['day', 'items', 'nextCursor']);
    expect(Array.isArray(r.body.items)).toBe(true);
  });

  it.each([
    ['?type=nao_existe'],
    ['?cursor=nao-e-cursor'],
    ...['0001-06-01T00:00:00.000Z', '+275760-09-13T00:00:00.000Z', '5'].map(
      (iso) => [`?cursor=${encodeURIComponent(Buffer.from(JSON.stringify({ at: iso, id: 'x' })).toString('base64url'))}`],
    ),
    [`?cursor=${encodeURIComponent(Buffer.from(JSON.stringify({ at: 'ontem', id: 'x' })).toString('base64url'))}`],
  ])('%s → 400', async (qs) => {
    const r = await get(ceo, qs);
    expect(r.status).toBe(400);
    expect(typeof r.body.error).toBe('string');
  });

  it('cursor bem formado é aceito', async () => {
    const r = await get(ceo, `?cursor=${encodeMoneyCursor(at(12, 0), 'ord:zzz')}`);
    expect(r.status).toBe(200);
    expect(r.body.day).toBe('2031-05-20');
  });

  it('papel sem money:overview → 403', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(gerente)).status).toBe(403);
  });
});
