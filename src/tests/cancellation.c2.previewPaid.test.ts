/**
 * Revisão final C2 — I2. A prévia diz se o pedido foi pago e para onde volta cada parte
 * (carteira x Pix/cartão), com a MESMA regra do cancelamento real (cancelOrderByCustomer):
 *  - custódia + Asaas: walletApplied volta à carteira; o provedor estorna refund − walletApplied
 *    só se o pedido foi pago (paymentStatus 'paid' e asaasPaymentId);
 *  - modo direto: sem carteira; a conta da loja estorna o refund só se foi pago;
 *  - carteira virtual (sem gateway): o refund inteiro é creditado na carteira.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@c2prevpaid.test';
let gatewayOriginal: any;
beforeAll(() => { gatewayOriginal = env.PAYMENT_GATEWAY; });
afterEach(async () => { env.PAYMENT_GATEWAY = gatewayOriginal; await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function cenario(opts: { paymentStatus: string; walletApplied?: number; provider?: string; asaasPaymentId?: string | null }) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja I2', isOpen: true } as any });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 244, subtotal: 236.6, deliveryFee: 7.4,
      status: 'criado', paymentMethod: 'pix', paymentStatus: opts.paymentStatus,
      walletApplied: opts.walletApplied ?? 0,
      ...(opts.asaasPaymentId !== null ? { asaasPaymentId: opts.asaasPaymentId ?? 'pay_i2' } : {}),
      ...(opts.provider ? { paymentProvider: opts.provider } : {}),
    } as any,
  });
  return { cliente, order };
}
const preview = (id: string, u: any) => request(app).get(`/api/orders/${id}/cancel-preview`).set('Authorization', bearer(u));

describe('Asaas (custódia)', () => {
  beforeEach(() => { env.PAYMENT_GATEWAY = 'asaas'; });

  it('pedido não pago: paid=false e nada volta a lugar nenhum', async () => {
    const { cliente, order } = await cenario({ paymentStatus: 'pending' });
    const r = await preview(order.id, cliente);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ cancellable: true, paid: false, walletPart: 0, providerPart: 0 });
  });

  it('pedido não pago com saldo reservado: só o saldo volta à carteira', async () => {
    const { cliente, order } = await cenario({ paymentStatus: 'pending', walletApplied: 50 });
    expect((await preview(order.id, cliente)).body.data).toMatchObject({ paid: false, walletPart: 50, providerPart: 0 });
  });

  it('pago com parte em carteira: divide carteira e Pix', async () => {
    const { cliente, order } = await cenario({ paymentStatus: 'paid', walletApplied: 50 });
    expect((await preview(order.id, cliente)).body.data).toMatchObject({ paid: true, refund: 244, walletPart: 50, providerPart: 194 });
  });

  it('pago só com Pix: tudo volta pelo Pix', async () => {
    const { cliente, order } = await cenario({ paymentStatus: 'paid' });
    expect((await preview(order.id, cliente)).body.data).toMatchObject({ paid: true, walletPart: 0, providerPart: 244 });
  });
});

describe('modo direto', () => {
  it('pago: a conta da loja estorna o valor; não pago: nada', async () => {
    const a = await cenario({ paymentStatus: 'paid', provider: 'asaas_loja' });
    expect((await preview(a.order.id, a.cliente)).body.data).toMatchObject({ direct: true, paid: true, walletPart: 0, providerPart: 244 });
    const b = await cenario({ paymentStatus: 'pending', provider: 'asaas_loja' });
    expect((await preview(b.order.id, b.cliente)).body.data).toMatchObject({ direct: true, paid: false, walletPart: 0, providerPart: 0 });
  });
});

describe('carteira virtual (sem gateway)', () => {
  it('o reembolso inteiro é creditado na carteira', async () => {
    env.PAYMENT_GATEWAY = 'none' as any;
    const { cliente, order } = await cenario({ paymentStatus: 'paid' });
    expect((await preview(order.id, cliente)).body.data).toMatchObject({ paid: true, walletPart: 244, providerPart: 0 });
  });
});
