/**
 * Revisão final da Fase 1 do modo SaaS (onda única de correções).
 *  I1. expiração do Pix com trava condicional (não devolve estoque duas vezes);
 *  I2. cancelamentos de pedido asaas_loja não encostam na custódia;
 *  I3. plano 1 fora do fluxo no modo direto (quote, aceite, /deliver);
 *  I5. confirmação/estorno da custódia ignoram pedidos asaas_loja; chave da plataforma recusada;
 *  I6. CPF do checkout respeita "um CPF por conta";
 *  M1/M2/M4/M6. nota de serviço, troca de chave com cobranças vivas, falha no create, freios do CEO.
 * Asaas mockado em services/asaas/client (sem rede).
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
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import asaasClient from '../services/asaas/client';
import { getRoute } from '../services/routeService';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { expireStalePixOrders } from '../services/asaas/expireOrders';

const DOMAIN = '@saas17.test';
const STORE_KEY = '$aact_hmlg_LOJA_17XX';
const del = asaasClient.delete as jest.Mock;
const deleteAs = asaasClient.deleteAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const postAs = asaasClient.postAs as jest.Mock;
const post = asaasClient.post as jest.Mock;
const get = asaasClient.get as jest.Mock;

let restore: () => Promise<void>;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;

export function randomCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  const dv = (base: number[]) => {
    const s = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
});

beforeEach(async () => {
  jest.clearAllMocks();
  for (const m of [del, deleteAs, getAs, postAs, post, get]) m.mockReset();
  (env as any).PAYMENT_GATEWAY = 'none';
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
  await updatePlatformConfig({ settlementMode: 'direto', directCardEnabled: false, autoApprovePayouts: false } as any, 'test');
});

afterEach(async () => {
  jest.restoreAllMocks();
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } }).catch(() => undefined);
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer(): Promise<TestUser> {
  const u = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { cpf: randomCpf() } });
  return u;
}

async function storeWithAccount(opts: { account?: boolean; quantity?: number; ownerId?: string } = {}) {
  const store = await prisma.store.create({
    data: { ownerId: opts.ownerId ?? await ownerIdForStore(DOMAIN), name: 'Loja 17', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: opts.quantity ?? 10 } } as any);
  if (opts.account !== false) {
    await prisma.storeAsaasAccount.create({
      data: {
        storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '17XX',
        environment: 'sandbox', status: 'valid',
      },
    });
  }
  return { store, product };
}

const qty = async (productId: string) => (await prisma.product.findUnique({ where: { id: productId } }))!.quantity;

// ───────────────────────────── I1 ─────────────────────────────
describe('I1 — expiração do Pix com trava condicional', () => {
  async function staleOrder(storeId: string, productId: string, provider: 'asaas' | 'asaas_loja', paymentId: string) {
    const cliente = await createTestUser('cliente', DOMAIN);
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId,
        items: { create: [{ productId, quantity: 2, price: 20 }] },
        totalValue: 40, deliveryFee: 0, status: 'criado', paymentMethod: 'pix',
        paymentStatus: 'pending', asaasChargeStatus: 'pending', asaasPaymentId: paymentId, paymentProvider: provider,
      } as any,
    });
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 40 * 60000) } });
    return order;
  }

  /** Simula o cliente cancelando o pedido (e devolvendo o estoque) durante a exclusão da cobrança. */
  const cancelByCustomerDuring = (orderId: string, productId: string) => async () => {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'cancelado', cancelledAt: new Date() } });
    await prisma.product.update({ where: { id: productId }, data: { quantity: { increment: 2 } } });
    return { deleted: true };
  };

  it('modo direto: cancelado pelo cliente entre o findMany e o processamento → estoque volta UMA vez e status não é sobrescrito', async () => {
    const { store, product } = await storeWithAccount();
    const order = await staleOrder(store.id, product.id, 'asaas_loja', 'pay_17_i1_dir');
    deleteAs.mockImplementation(cancelByCustomerDuring(order.id, product.id));

    const n = await expireStalePixOrders({ onlyDirect: true });

    expect(deleteAs).toHaveBeenCalled();
    expect(n).toBe(0);
    expect(await qty(product.id)).toBe(12); // 10 + 2 do cancelamento do cliente (e só)
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('cancelado');
    expect(after!.paymentStatus).toBe('pending'); // a expiração não sobrescreveu
    expect(after!.asaasChargeStatus).toBe('pending');
  });

  it('custódia: mesma corrida → estoque volta UMA vez', async () => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    const { store, product } = await storeWithAccount();
    const order = await staleOrder(store.id, product.id, 'asaas', 'pay_17_i1_cus');
    del.mockImplementation(cancelByCustomerDuring(order.id, product.id));

    await expireStalePixOrders();

    expect(del).toHaveBeenCalledWith('/payments/pay_17_i1_cus');
    expect(await qty(product.id)).toBe(12);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('pending');
  });

  it('varre os mais antigos primeiro (orderBy createdAt asc)', async () => {
    const spy = jest.spyOn(prisma.order, 'findMany');
    await expireStalePixOrders({ onlyDirect: true });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'asc' } }));
  });
});

// ───────────────────────────── I2 ─────────────────────────────
describe('I2 — cancelamentos de pedido asaas_loja não encostam na custódia', () => {
  type Scenario = {
    status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado';
    paymentStatus: 'paid' | 'pending';
    delivery?: 'pending' | 'picked';
    acceptedAt?: boolean;
  };

  async function scenario(sc: Scenario) {
    const cliente = await createTestUser('cliente', DOMAIN);
    const lojista = await createTestUser('lojista', DOMAIN);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    const { store, product } = await storeWithAccount({ ownerId: lojista.userId });
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id,
        items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
        subtotal: 40, totalValue: 52, deliveryFee: 12, status: sc.status, paymentMethod: 'pix',
        paymentStatus: sc.paymentStatus, asaasChargeStatus: sc.paymentStatus === 'paid' ? 'received' : 'pending',
        asaasPaymentId: `pay_17_i2_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
        acceptedAt: sc.acceptedAt ? new Date() : null,
        walletDistribution: { storeAmount: 52, appCommission: 0, commissionPercent: 0 },
      } as any,
    });
    let delivery: any = null;
    if (sc.delivery) {
      delivery = await prisma.delivery.create({
        data: {
          orderId: order.id, status: sc.delivery, fee: 12, distance: 4, pin: '12345', pinRetirada: '54321',
          motoboyId: sc.delivery === 'picked' ? motoboy.userId : null,
        },
      });
      await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
    }
    return { cliente, lojista, motoboy, store, product, order, delivery };
  }

  async function expectNoCustody(orderId: string, owners: string[]) {
    expect(await prisma.payout.count({ where: { orderId } })).toBe(0);
    expect(await prisma.appCashboxEntry.count({ where: { orderId } })).toBe(0);
    expect(await prisma.walletEntry.count({ where: { OR: [{ relatedId: orderId }, { reference: { contains: orderId } }] } })).toBe(0);
    expect(await prisma.wallet.count({ where: { owner: { in: owners } } })).toBe(0);
    // Nenhuma chamada à conta-mãe (estorno, consulta ou exclusão).
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  }

  const lastCancellation = (orderId: string) => prisma.cancellation.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  const owners = (s: any) => [s.cliente.userId, s.store.id, s.motoboy.userId];
  const statusOf = async (id: string) => (await prisma.order.findUnique({ where: { id } }))!.status;

  beforeEach(async () => {
    post.mockResolvedValue({ id: 'refund_mae', status: 'REFUNDED' });
    await updatePlatformConfig({ customerAbsentWaitMin: 0 } as any, 'test');
  });

  for (const gateway of ['none', 'asaas'] as const) {
    describe(`PAYMENT_GATEWAY=${gateway}`, () => {
      beforeEach(() => { (env as any).PAYMENT_GATEWAY = gateway; });

      it('cliente cancela pedido PAGO (motoboy em rota): sem carteira/AppCashbox/Payout/conta-mãe; refund pending', async () => {
        const s = await scenario({ status: 'enviado', paymentStatus: 'paid', delivery: 'picked', acceptedAt: true });
        const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
        expect(res.status).toBe(200);
        expect(res.body.refundStatus).toBe('pending');
        expect(await statusOf(s.order.id)).toBe('cancelado');
        expect((await lastCancellation(s.order.id))!.refundStatus).toBe('pending');
        expect(await qty(s.product.id)).toBe(12);
        await expectNoCustody(s.order.id, owners(s));
      });

      it('cliente cancela pedido NÃO pago: só status, nada de dinheiro', async () => {
        const s = await scenario({ status: 'criado', paymentStatus: 'pending' });
        const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
        expect(res.status).toBe(200);
        expect(res.body.refundStatus).toBe('processed');
        expect(await statusOf(s.order.id)).toBe('cancelado');
        await expectNoCustody(s.order.id, owners(s));
      });

      it('loja rejeita pedido pago (já aceito): sem taxa da loja, sem estorno pela conta-mãe; refund pending', async () => {
        const s = await scenario({ status: 'pago', paymentStatus: 'paid', acceptedAt: true });
        const res = await request(app).post(`/api/orders/${s.order.id}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'sem estoque' });
        expect(res.status).toBe(200);
        expect(res.body.refundStatus).toBe('pending');
        expect(await statusOf(s.order.id)).toBe('rejeitado');
        expect((await lastCancellation(s.order.id))!.refundStatus).toBe('pending');
        await expectNoCustody(s.order.id, owners(s));
      });

      it('motoboy marca cliente ausente: sem compensação pela custódia nem estorno pela conta-mãe; refund pending', async () => {
        const s = await scenario({ status: 'enviado', paymentStatus: 'paid', delivery: 'picked', acceptedAt: true });
        const res = await request(app).post(`/api/deliveries/${s.delivery.id}/cliente-ausente`).set('Authorization', bearer(s.motoboy)).send({});
        expect(res.status).toBe(200);
        expect(res.body.refundStatus).toBe('pending');
        expect(await statusOf(s.order.id)).toBe('cancelado');
        await expectNoCustody(s.order.id, owners(s));
      });

      it('cancelOrderWithFullRefund (timeout): sem carteira/estorno pela conta-mãe; refund pending', async () => {
        const { cancelOrderWithFullRefund } = await import('../controllers/cancellationController');
        const { toApiOrder, orderInclude } = await import('../repositories/order.repository');
        const s = await scenario({ status: 'aguardando_motoboy', paymentStatus: 'paid', delivery: 'pending', acceptedAt: true });
        const order = toApiOrder(await prisma.order.findUnique({ where: { id: s.order.id }, include: orderInclude }));
        const r = await cancelOrderWithFullRefund(order, { reason: 'timeout', reasonCode: 'store_rejected', cancelledBy: 'store' });
        expect(r.ok).toBe(true);
        expect(r.refundStatus).toBe('pending');
        expect(await statusOf(s.order.id)).toBe('cancelado');
        await expectNoCustody(s.order.id, owners(s));
      });

      it('motoboy desiste após retirar: taxa do motoboy NÃO é debitada de carteira nem lançada no AppCashbox', async () => {
        const s = await scenario({ status: 'enviado', paymentStatus: 'paid', delivery: 'picked', acceptedAt: true });
        const res = await request(app).post(`/api/deliveries/${s.delivery.id}/reject`).set('Authorization', bearer(s.motoboy)).send({});
        expect(res.status).toBe(202);
        expect(res.body.feeStatus).toBe('none');
        await expectNoCustody(s.order.id, owners(s));
      });

      it('loja confirma a devolução: pedido cancelado sem crédito em carteira', async () => {
        const s = await scenario({ status: 'enviado', paymentStatus: 'paid', delivery: 'picked', acceptedAt: true });
        await prisma.delivery.update({ where: { id: s.delivery.id }, data: { statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '777777' } });
        const res = await request(app).post(`/api/deliveries/${s.delivery.id}/confirm-return`).set('Authorization', bearer(s.lojista)).send({ pinDevolucao: '777777' });
        expect(res.status).toBe(200);
        expect(await statusOf(s.order.id)).toBe('cancelado');
        await expectNoCustody(s.order.id, owners(s));
      });
    });
  }
});

// ───────────────────────────── I3 ─────────────────────────────
describe('I3 — plano 1 fora do fluxo no modo direto', () => {
  it('quote: loja "plano 1" no modo direto cobra a taxa da fórmula da rota (igual ao createOrder direto)', async () => {
    const { calculateDeliveryFeeWithConfig } = await import('../utils/walletCalculations');
    const cliente = await buyer();
    const { store } = await storeWithAccount();
    const res = await request(app).post('/api/orders/quote').set('Authorization', bearer(cliente))
      .send({ storeId: store.id, latitude: -22.95, longitude: -43.25 });
    expect(res.status).toBe(200);
    const expected = await calculateDeliveryFeeWithConfig(3);
    expect(expected).toBeGreaterThan(0);
    expect(res.body.deliveryFee).toBe(expected);
    expect(res.body.distanceKm).toBe(3);
  });

  it('quote na custódia continua respeitando o plano 1 (taxa zero)', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const cliente = await buyer();
    const { store } = await storeWithAccount();
    const res = await request(app).post('/api/orders/quote').set('Authorization', bearer(cliente))
      .send({ storeId: store.id, latitude: -22.95, longitude: -43.25 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ plan: 1, deliveryFee: 0 });
  });

  it('aceite da loja "plano 1" no modo direto cria a Delivery (pool de motoboys)', async () => {
    const lojista = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const { store, product } = await storeWithAccount({ ownerId: lojista.userId });
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        subtotal: 20, totalValue: 28, deliveryFee: 8, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
        paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: 'asaas_loja',
      } as any,
    });
    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(lojista)).send({});
    expect(res.status).toBe(200);
    expect(res.body.requiresDelivery).not.toBe(false);
    const delivery = await prisma.delivery.findFirst({ where: { orderId: order.id } });
    expect(delivery).toBeTruthy();
    expect(Number(delivery!.fee)).toBe(8);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.deliveryId).toBe(delivery!.id);
  });

  it('POST /orders/:id/deliver em pedido asaas_loja → 400 PLAN1_DISABLED e o pedido não muda', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const { store, product } = await storeWithAccount();
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        totalValue: 28, deliveryFee: 8, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: 'asaas_loja',
      } as any,
    });
    const res = await request(app).post(`/api/orders/${order.id}/deliver`).set('Authorization', bearer(cliente)).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PLAN1_DISABLED');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('pago');
  });
});

// ───────────────────────────── I4 ─────────────────────────────
describe('I4 — URL do webhook de autorização vem de PUBLIC_API_URL', () => {
  it('authWebhookUrl usa env.PUBLIC_API_URL (sem barra dupla), não um host fixo', async () => {
    const { authWebhookUrl } = await import('../controllers/storeAsaasController');
    const original = (env as any).PUBLIC_API_URL;
    try {
      (env as any).PUBLIC_API_URL = 'https://api.exemplo.test/';
      expect(authWebhookUrl('loja1')).toBe('https://api.exemplo.test/webhooks/asaas/loja/loja1/autorizacao');
    } finally {
      (env as any).PUBLIC_API_URL = original;
    }
  });
});

// ───────────────────────────── I5 ─────────────────────────────
describe('I5 — custódia ignora pedidos asaas_loja; chave da plataforma não vira conta da loja', () => {
  async function directPending(paymentId: string, paymentStatus: 'pending' | 'paid' = 'pending') {
    const cliente = await createTestUser('cliente', DOMAIN);
    const { store, product } = await storeWithAccount();
    return prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        totalValue: 28, deliveryFee: 8, status: 'criado', paymentMethod: 'pix', paymentStatus,
        asaasChargeStatus: paymentStatus === 'paid' ? 'received' : 'pending', asaasPaymentId: paymentId, paymentProvider: 'asaas_loja',
        walletDistribution: { storeAmount: 28, appCommission: 0, commissionPercent: 0 },
      } as any,
    });
  }

  it('confirmOrderPaidByPayment (webhook da conta-mãe) não confirma nem cria Payout para pedido asaas_loja', async () => {
    const { confirmOrderPaidByPayment } = await import('../services/asaas/orderPayment');
    const order = await directPending('pay_17_i5_conf');
    await confirmOrderPaidByPayment('pay_17_i5_conf', 'RECEIVED');
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('pending');
    expect(await prisma.payout.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('markOrderRefunded (webhook da conta-mãe) não marca pedido asaas_loja como estornado', async () => {
    const { markOrderRefunded } = await import('../services/asaas/orderPayment');
    const order = await directPending('pay_17_i5_ref', 'paid');
    await markOrderRefunded('pay_17_i5_ref');
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('paid');
    expect(after!.asaasChargeStatus).toBe('received');
  });

  it('connectStoreAsaas recusa a chave da conta-mãe: 400 ASAAS_KEY_IS_PLATFORM, sem chamar o Asaas nem gravar', async () => {
    const { connectStoreAsaas } = await import('../services/asaasLoja/account');
    const original = (env as any).ASAAS_API_KEY;
    (env as any).ASAAS_API_KEY = '$aact_hmlg_PLATAFORMA_DROP_17';
    try {
      const { store } = await storeWithAccount({ account: false });
      getAs.mockResolvedValue({ balance: 0 });
      await expect(connectStoreAsaas(store.id, ' $aact_hmlg_PLATAFORMA_DROP_17 ', 'actor')).rejects
        .toMatchObject({ statusCode: 400, code: 'ASAAS_KEY_IS_PLATFORM' });
      expect(getAs).not.toHaveBeenCalled();
      expect(await prisma.storeAsaasAccount.count({ where: { storeId: store.id } })).toBe(0);
      // Outra chave continua conectando normalmente.
      postAs.mockResolvedValue({ id: 'wh_17' });
      await expect(connectStoreAsaas(store.id, STORE_KEY, 'actor')).resolves.toMatchObject({ status: 'valid' });
    } finally {
      (env as any).ASAAS_API_KEY = original;
    }
  });
});

// ───────────────────────────── I6 ─────────────────────────────
describe('I6 — CPF do checkout respeita "um CPF por conta"', () => {
  it('CPF digitado que já é de outra conta → 409 CPF_IN_USE, sem gravar CPF, sem pedido, sem cobrança', async () => {
    const outro = await buyer();
    const cpfDoOutro = (await prisma.user.findUnique({ where: { id: outro.userId } }))!.cpf!;
    const cliente = await createTestUser('cliente', DOMAIN); // sem CPF no perfil
    const { store, product } = await storeWithAccount();

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send({
      storeId: store.id, products: [{ productId: product.id, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
      address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25, cpf: cpfDoOutro,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CPF_IN_USE');
    expect((await prisma.user.findUnique({ where: { id: cliente.userId } }))!.cpf).toBeNull();
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect(await qty(product.id)).toBe(10);
    expect(postAs).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── M1 ─────────────────────────────
describe('M1 — nota de serviço de pedido direto sem comissão do app', () => {
  async function entregaPicked(provider: 'asaas' | 'asaas_loja') {
    const { store } = await storeWithAccount();
    const cliente = await createTestUser('cliente', DOMAIN);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, totalValue: 30, subtotal: 20, deliveryFee: 10,
        status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: provider,
      } as any,
    });
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, status: 'picked', motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321' },
    });
    return { order, delivery, motoboy };
  }

  it('pedido asaas_loja entregue: nota com appCommission 0 e a entrega inteira como valor do motoboy', async () => {
    const { order, delivery, motoboy } = await entregaPicked('asaas_loja');
    const res = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
    expect(res.status).toBe(200);
    const inv = await prisma.deliveryInvoice.findFirst({ where: { orderId: order.id } });
    expect(inv).toBeTruthy();
    expect(Number(inv!.appCommission)).toBe(0);
    expect(Number(inv!.commissionPercent)).toBe(0);
    expect(Number(inv!.motoboyAmount)).toBe(10);
  });

  it('pedido da custódia segue com a comissão do app na nota', async () => {
    const { order, delivery, motoboy } = await entregaPicked('asaas');
    const res = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
    expect(res.status).toBe(200);
    const inv = await prisma.deliveryInvoice.findFirst({ where: { orderId: order.id } });
    expect(Number(inv!.appCommission)).toBeGreaterThan(0);
  });
});

// ───────────────────────────── M2 ─────────────────────────────
describe('M2 — troca de chave com cobranças vivas na conta antiga', () => {
  const NEW_KEY = '$aact_hmlg_OUTRA_CONTA_17';

  async function livePixOrder(storeId: string, productId: string, paymentStatus: 'pending' | 'paid' = 'pending') {
    const cliente = await createTestUser('cliente', DOMAIN);
    return prisma.order.create({
      data: {
        customerId: cliente.userId, storeId, items: { create: [{ productId, quantity: 1, price: 20 }] },
        totalValue: 28, deliveryFee: 8, status: 'criado', paymentMethod: 'pix', paymentStatus,
        asaasChargeStatus: 'pending', asaasPaymentId: `pay_17_m2_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
      } as any,
    });
  }

  it('chave diferente com Pix pendente na conta atual → 409 PENDING_DIRECT_ORDERS e nada muda', async () => {
    const { connectStoreAsaas } = await import('../services/asaasLoja/account');
    const { store, product } = await storeWithAccount();
    await livePixOrder(store.id, product.id);
    getAs.mockResolvedValue({ balance: 0 });

    await expect(connectStoreAsaas(store.id, NEW_KEY, 'actor')).rejects.toMatchObject({ statusCode: 409, code: 'PENDING_DIRECT_ORDERS' });
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(row!.apiKeyLast4).toBe('17XX');
    expect(await prisma.storeAsaasAudit.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('mesma chave (reconectar) não é bloqueada; sem Pix pendente a troca passa', async () => {
    const { connectStoreAsaas } = await import('../services/asaasLoja/account');
    const { store, product } = await storeWithAccount();
    await livePixOrder(store.id, product.id, 'paid');
    getAs.mockResolvedValue({ balance: 0 });
    postAs.mockResolvedValue({ id: 'wh_17_m2' });

    await expect(connectStoreAsaas(store.id, STORE_KEY, 'actor')).resolves.toMatchObject({ status: 'valid' });
    await expect(connectStoreAsaas(store.id, NEW_KEY, 'actor')).resolves.toMatchObject({ status: 'valid', apiKeyLast4: NEW_KEY.slice(-4) });
  });

  it('pela rota do lojista também responde 409 PENDING_DIRECT_ORDERS', async () => {
    const lojista = await createTestUser('lojista', DOMAIN);
    const { store, product } = await storeWithAccount({ ownerId: lojista.userId });
    await livePixOrder(store.id, product.id);
    getAs.mockResolvedValue({ balance: 0 });
    const res = await request(app).put(`/api/stores/${store.id}/asaas`).set('Authorization', bearer(lojista)).send({ apiKey: NEW_KEY });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'PENDING_DIRECT_ORDERS' });
  });
});

// ───────────────────────────── M4 ─────────────────────────────
describe('M4 — falha ao gravar o pedido direto devolve o estoque', () => {
  const body = (storeId: string, productId: string, idempotentKey?: string) => ({
    storeId, products: [{ productId, quantity: 3 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25, ...(idempotentKey ? { idempotentKey } : {}),
  });

  it('P2002 de idempotentKey (requisição duplicada em paralelo): estoque volta e responde o pedido já criado', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const key = crypto.randomUUID();
    const realCreate = prisma.order.create.bind(prisma.order);
    let sibling: any = null;
    jest.spyOn(prisma.order, 'create').mockImplementationOnce((async () => {
      // A "outra" requisição gravou primeiro com a mesma chave.
      sibling = await realCreate({
        data: {
          customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 3, price: 20 }] },
          totalValue: 68, deliveryFee: 8, status: 'criado', paymentMethod: 'pix', paymentStatus: 'pending',
          paymentProvider: 'asaas_loja', idempotentKey: key,
        } as any,
      });
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`idempotentKey`)', { code: 'P2002', clientVersion: 'test' });
    }) as any);

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id, key));

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(sibling.id);
    expect(await qty(product.id)).toBe(10); // a baixa desta requisição foi devolvida
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(1);
    expect(postAs).not.toHaveBeenCalled();
  });

  it('erro qualquer no create: 500, estoque devolvido, nenhum pedido nem cobrança', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    jest.spyOn(prisma.order, 'create').mockRejectedValueOnce(new Error('db fora'));

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id));

    expect(res.status).toBe(500);
    expect(await qty(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect(postAs).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── M6 ─────────────────────────────
describe('M6 — settlementMode e directCardEnabled só pelo CEO', () => {
  let rpSnapshot: any[] = [];
  beforeAll(async () => {
    rpSnapshot = await prisma.rolePermissions.findMany({
      where: { role: 'gerente_geral' }, select: { role: true, permissions: true, notificationTargets: true, updatedBy: true },
    });
  });
  afterAll(async () => {
    await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_geral' } });
    for (const row of rpSnapshot) await prisma.rolePermissions.create({ data: row });
  });
  beforeEach(async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'gerente_geral' },
      create: { role: 'gerente_geral', permissions: ['settings:manage'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['settings:manage'] },
    });
  });

  it('gerente com settings:manage: 403 CEO_ONLY para settlementMode/directCardEnabled; os freios comuns seguem liberados', async () => {
    const { getSaasConfig } = await import('../utils/settlement');
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const put = (body: object) => request(app).put('/api/admin/switches').set('Authorization', bearer(gerente)).send(body);

    const a = await put({ settlementMode: 'custodia' });
    expect(a.status).toBe(403);
    expect(a.body.code).toBe('CEO_ONLY');
    const b = await put({ directCardEnabled: true, rankingPrizesEnabled: false });
    expect(b.status).toBe(403);
    expect(await getSaasConfig()).toMatchObject({ settlementMode: 'direto', directCardEnabled: false });

    expect((await put({ rankingPrizesEnabled: false })).status).toBe(200);
  });

  it('CEO continua alterando o modo de liquidação', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send({ settlementMode: 'custodia' });
    expect(res.status).toBe(200);
    expect(res.body.settlementMode).toBe('custodia');
  });
});
