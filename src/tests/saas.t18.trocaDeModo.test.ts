/**
 * Troca de modo com pedido em andamento (decisão do usuário, 2026-10-08):
 * "eu posso ter mudado o modo, mas o pedido tem que ser finalizado" — o pedido segue
 * até o fim pelas regras do modo em que NASCEU (Order.paymentProvider), nunca pelo
 * settlementMode do momento.
 */
// Task 2.5 (setup): Asaas sem rede — estorno da conta-mãe (post) e da conta da loja (postAs).
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return { __esModule: true, ...actual, default: { ...actual.default, post: jest.fn(), postAs: jest.fn() } };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import asaasClient from '../services/asaas/client';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas18.test';
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } }).catch(() => undefined);
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function paidOrder(provider: 'asaas' | 'asaas_loja', deliveryFee: number) {
  const lojista = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 18', plan: 1, isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
      subtotal: 20, totalValue: 20 + deliveryFee, deliveryFee, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: provider,
    } as any,
  });
  return { lojista, order };
}

describe('pedido termina no modo em que nasceu', () => {
  it('pedido da custódia (loja plano 1, taxa 0) aceito depois da troca para direto continua sem motoboy', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const { lojista, order } = await paidOrder('asaas', 0);
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');

    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(lojista)).send({});
    expect(res.status).toBe(200);
    expect(res.body.requiresDelivery).toBe(false);
    // Sem Delivery: um motoboy não pode pegar corrida de taxa R$ 0 que ninguém pagou.
    expect(await prisma.delivery.findFirst({ where: { orderId: order.id } })).toBeNull();
  });

  it('pedido do modo direto aceito depois da volta para custódia continua indo ao pool de motoboys', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const { lojista, order } = await paidOrder('asaas_loja', 8);
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');

    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(lojista)).send({});
    expect(res.status).toBe(200);
    const delivery = await prisma.delivery.findFirst({ where: { orderId: order.id } });
    expect(delivery).toBeTruthy();
    expect(Number(delivery!.fee)).toBe(8);
  });
});

// ---------------------------------------------------------------------------------------
// Task 2.5 (P16): o pedido termina no modo em que nasceu também na entrega e no
// cancelamento; e o saldo de custódia que sobrou continua sacável depois da troca.
// ---------------------------------------------------------------------------------------
describe('Task 2.5 — pedido e saldo terminam no modo em que nasceram', () => {
  const STORE_KEY = '$aact_hmlg_LOJA_18XX';
  const post = asaasClient.post as jest.Mock;
  const postAs = asaasClient.postAs as jest.Mock;
  const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;

  beforeEach(async () => {
    post.mockReset();
    postAs.mockReset();
    post.mockResolvedValue({ id: 'ref_mae', status: 'REFUNDED' });
    postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
    (env as any).PAYMENT_GATEWAY = 'asaas';
    await updatePlatformConfig({ autoApprovePayouts: false, motoboyShareDirect: 100, directTransferMaxAmount: 150 } as any, 'test');
  });
  afterEach(async () => {
    (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
    jest.restoreAllMocks();
    const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
    const storeIds = stores.map((s) => s.id);
    const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.directRefund.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.storeAsaasAccount.deleteMany({ where: { storeId: { in: storeIds } } });
  });

  /** Pedido pago no modo `bornIn`; com `picked`, a entrega já foi retirada por um motoboy com chave Pix. */
  async function orderBornIn(bornIn: 'custodia' | 'direto', opts: { picked?: boolean } = {}) {
    await updatePlatformConfig({ settlementMode: bornIn } as any, 'test');
    const provider = bornIn === 'direto' ? 'asaas_loja' : 'asaas';
    const lojista = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
    const store = await prisma.store.create({
      data: { ownerId: lojista.userId, name: 'Loja 18b', plan: 2, isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
    });
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '18XX', environment: 'sandbox', status: 'valid' },
    });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        subtotal: 20, totalValue: 30, deliveryFee: 10, deliveryDistance: 4, status: 'pago',
        paymentMethod: 'pix', paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: provider,
        asaasPaymentId: `pay_18_${Math.random().toString(36).slice(2, 8)}`,
        walletDistribution: provider === 'asaas_loja' ? { storeAmount: 30, appCommission: 0, commissionPercent: 0 } : undefined,
      } as any,
    });
    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, status: opts.picked ? 'picked' : 'pending', motoboyId: opts.picked ? motoboy.userId : null,
        fee: 10, distance: 4, pin: '12345', pinRetirada: '54321',
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
    return { lojista, cliente, motoboy, store, order, delivery };
  }
  const switchTo = (mode: 'custodia' | 'direto') => updatePlatformConfig({ settlementMode: mode } as any, 'test');
  const finalizar = (s: any) =>
    request(app).post(`/api/deliveries/${s.delivery.id}/finalizar`).set('Authorization', bearer(s.motoboy)).send({ pin: '12345' });
  const cancelar = (s: any) => request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});

  describe('PIN de entrega', () => {
    it('pedido direto pago, troca para custódia, PIN → MotoboyTransfer e nenhum Payout', async () => {
      const s = await orderBornIn('direto', { picked: true });
      await switchTo('custodia');
      const res = await finalizar(s);
      expect(res.status).toBe(200);
      const ts = await prisma.motoboyTransfer.findMany({ where: { orderId: s.order.id } });
      expect(ts).toHaveLength(1);
      expect(Number(ts[0].amount)).toBe(10);
      expect(ts[0].motoboyId).toBe(s.motoboy.userId);
      expect(await prisma.payout.count({ where: { orderId: s.order.id } })).toBe(0);
      expect(await prisma.wallet.count({ where: { owner: s.motoboy.userId } })).toBe(0);
    });

    it('pedido de custódia pago, troca para direto, PIN → Payout normal e nenhum MotoboyTransfer', async () => {
      const s = await orderBornIn('custodia', { picked: true });
      await switchTo('direto');
      const res = await finalizar(s);
      expect(res.status).toBe(200);
      expect(await prisma.motoboyTransfer.count({ where: { orderId: s.order.id } })).toBe(0);
      const payouts = await prisma.payout.findMany({ where: { orderId: s.order.id, recipientType: 'motoboy' } });
      expect(payouts).toHaveLength(1);
      expect(payouts[0].recipientId).toBe(s.motoboy.userId);
      expect(payouts[0].status).toBe('pending');
      expect(Number(payouts[0].amount)).toBe(8);
    });
  });

  describe('cancelamento depois da troca segue o provedor do pedido', () => {
    it('pedido direto, troca para custódia, cliente cancela → estorno pela chave da loja; nada na conta-mãe', async () => {
      const s = await orderBornIn('direto');
      await switchTo('custodia');
      const res = await cancelar(s);
      expect(res.status).toBe(200);
      expect(res.body.refundStatus).toBe('processed');
      expect(postAs).toHaveBeenCalledTimes(1);
      expect(postAs.mock.calls[0][0]).toBe(STORE_KEY);
      expect(postAs.mock.calls[0][1]).toBe(`/payments/${s.order.asaasPaymentId}/refund`);
      expect(postAs.mock.calls[0][2].value).toBe(30);
      expect(post).not.toHaveBeenCalled();
      expect((await prisma.directRefund.findUnique({ where: { orderId: s.order.id } }))!.status).toBe('done');
      expect(await prisma.wallet.count({ where: { owner: s.cliente.userId } })).toBe(0);
    });

    it('pedido de custódia, troca para direto, cliente cancela → estorno pela conta-mãe; nenhum DirectRefund', async () => {
      const s = await orderBornIn('custodia');
      await switchTo('direto');
      const res = await cancelar(s);
      expect(res.status).toBe(200);
      expect(res.body.refundStatus).toBe('processed');
      expect(postAs).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0][0]).toBe(`/payments/${s.order.asaasPaymentId}/refund`);
      expect(post.mock.calls[0][1].value).toBe(30);
      expect(await prisma.directRefund.findUnique({ where: { orderId: s.order.id } })).toBeNull();
      expect((await prisma.order.findUnique({ where: { id: s.order.id } }))!.paymentStatus).toBe('refunded');
    });
  });

  describe('saldo de custódia que sobrou depois da troca para direto', () => {
    async function motoboyWithReleasedPayout() {
      const motoboy = await createTestUser('motoboy', DOMAIN);
      await prisma.payout.create({
        data: { recipientType: 'motoboy', recipientId: motoboy.userId, orderId: `ord_18_${Date.now()}`, amount: 8, status: 'released', releasedAt: new Date() },
      });
      return motoboy;
    }
    async function clienteWithBalance() {
      const cliente = await createTestUser('cliente', DOMAIN);
      await prisma.wallet.create({ data: { owner: cliente.userId, ownerType: 'user', balance: 15 } });
      return cliente;
    }
    const leftover = (u: any) => request(app).get('/api/settings/custody-leftover').set('Authorization', bearer(u));

    it('motoboy com Payout released → extrato e saque continuam acessíveis (200)', async () => {
      const motoboy = await motoboyWithReleasedPayout();
      await switchTo('direto');
      const list = await request(app).get('/api/payouts/my').set('Authorization', bearer(motoboy));
      expect(list.status).toBe(200);
      const summary = await request(app).get('/api/payouts/my/summary').set('Authorization', bearer(motoboy));
      expect(summary.status).toBe(200);
      const mine = await request(app).get('/api/withdrawals/my-withdrawals').set('Authorization', bearer(motoboy));
      expect(mine.status).toBe(200);
      // O saque chega ao controller (quem responde é a validação do valor, não o gate do modo).
      const saque = await request(app).post('/api/withdrawals/request').set('Authorization', bearer(motoboy)).send({ amount: 0 });
      expect(saque.body?.code).not.toBe('FEATURE_DISABLED');
      expect(saque.status).toBe(400);
      expect((await leftover(motoboy)).body).toEqual({ hasLeftover: true });
    });

    it('cliente com saldo na carteira → saque do saldo continua acessível', async () => {
      const cliente = await clienteWithBalance();
      await switchTo('direto');
      const saque = await request(app).post('/api/withdrawals/request-user').set('Authorization', bearer(cliente)).send({ amount: 0 });
      expect(saque.body?.code).not.toBe('FEATURE_DISABLED');
      expect(saque.status).toBe(400);
      expect((await leftover(cliente)).body).toEqual({ hasLeftover: true });
    });

    it('lojista com Payout da loja em aberto → tem saldo do modo anterior', async () => {
      const lojista = await createTestUser('lojista', DOMAIN);
      const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja 18c', isOpen: true } as any });
      await prisma.payout.create({ data: { recipientType: 'store', recipientId: store.id, orderId: `ord_18s_${Date.now()}`, amount: 18, status: 'requested' } });
      await switchTo('direto');
      expect((await leftover(lojista)).body).toEqual({ hasLeftover: true });
      const list = await request(app).get(`/api/payouts/my?storeId=${store.id}`).set('Authorization', bearer(lojista));
      expect(list.status).toBe(200);
    });

    it('sem saldo → 404 como hoje', async () => {
      const motoboy = await createTestUser('motoboy', DOMAIN);
      await prisma.payout.create({
        data: { recipientType: 'motoboy', recipientId: motoboy.userId, orderId: `ord_18p_${Date.now()}`, amount: 8, status: 'paid', paidAt: new Date() },
      });
      await prisma.wallet.create({ data: { owner: motoboy.userId, ownerType: 'motoboy', balance: 0 } });
      await switchTo('direto');
      for (const path of ['/api/payouts/my', '/api/payouts/my/summary', '/api/withdrawals/my-withdrawals']) {
        const r = await request(app).get(path).set('Authorization', bearer(motoboy));
        expect(r.status).toBe(404);
        expect(r.body.code).toBe('FEATURE_DISABLED');
      }
      const saque = await request(app).post('/api/withdrawals/request').set('Authorization', bearer(motoboy)).send({ amount: 8 });
      expect(saque.status).toBe(404);
      expect((await leftover(motoboy)).body).toEqual({ hasLeftover: false });
    });

    it('com saldo, recarga e transferências de custódia continuam fechadas (só ver e sacar)', async () => {
      const cliente = await clienteWithBalance();
      await switchTo('direto');
      const topup = await request(app).post(`/api/wallets/${cliente.userId}/topup`).set('Authorization', bearer(cliente)).send({ amount: 10 });
      expect(topup.status).toBe(404);
      const transfer = await request(app).post('/api/wallets/transfer').set('Authorization', bearer(cliente)).send({});
      expect(transfer.status).toBe(404);
    });

    it('fail closed: erro ao consultar o saldo → 404 (não abre a rota)', async () => {
      const motoboy = await motoboyWithReleasedPayout();
      await switchTo('direto');
      jest.spyOn(prisma.payout, 'findFirst').mockRejectedValue(new Error('db down'));
      jest.spyOn(prisma.wallet, 'findFirst').mockRejectedValue(new Error('db down'));
      const r = await request(app).get('/api/payouts/my').set('Authorization', bearer(motoboy));
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('FEATURE_DISABLED');
    });

    it('modo custódia: não há "saldo do modo anterior"', async () => {
      const motoboy = await motoboyWithReleasedPayout();
      await switchTo('custodia');
      expect((await leftover(motoboy)).body).toEqual({ hasLeftover: false });
    });
  });
});
