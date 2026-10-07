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
