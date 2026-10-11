/**
 * H8 — a nota da entrega não entrega CPF e e-mail do motoboy a quem não precisa.
 *
 * GET /invoices/by-order/:id e GET /invoices/:id devolviam a DeliveryInvoice inteira ao
 * cliente e à loja, inclusive `motoboyCpf` e `motoboyEmail`. Só o próprio motoboy e o
 * admin veem esses dois campos; o resto da nota continua igual.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@hotfixh8.test';
const invoiceIds: string[] = [];

afterEach(async () => {
  await prisma.deliveryInvoice.deleteMany({ where: { id: { in: invoiceIds.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const lojista = await createTestUser('lojista', DOMAIN);
  const admin = await createTestUser('ceo', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja h8' } });
  const orderId = `order-h8-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const invoice = await prisma.deliveryInvoice.create({
    data: {
      invoiceNumber: `H8-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      orderId, deliveryId: `delivery-${orderId}`,
      motoboyId: motoboy.userId, motoboyName: 'Motoboy h8',
      motoboyEmail: 'motoboy-h8@exemplo.test', motoboyCpf: '52998224725',
      storeId: store.id, storeName: 'Loja h8', storeCnpj: '11222333000181',
      customerId: cliente.userId, customerName: 'Cliente h8',
      deliveryFee: 8, motoboyAmount: 6.4, appCommission: 1.6, commissionPercent: 20,
    },
  });
  invoiceIds.push(invoice.id);
  return { cliente, motoboy, lojista, admin, invoice, orderId };
}

const byOrder = (u: TestUser, orderId: string) =>
  request(app).get(`/api/invoices/by-order/${orderId}`).set('Authorization', bearer(u));
const byId = (u: TestUser, id: string) =>
  request(app).get(`/api/invoices/${id}`).set('Authorization', bearer(u));

describe('H8 — CPF e e-mail do motoboy na nota', () => {
  it('cliente recebe a nota sem CPF e sem e-mail do motoboy (por pedido e por id)', async () => {
    const { cliente, invoice, orderId } = await setup();
    for (const res of [await byOrder(cliente, orderId), await byId(cliente, invoice.id)]) {
      expect(res.status).toBe(200);
      expect(res.body.motoboyCpf).toBeUndefined();
      expect(res.body.motoboyEmail).toBeUndefined();
      expect(res.body.motoboyName).toBe('Motoboy h8');
      expect(res.body.storeCnpj).toBe('11222333000181');
      expect(Number(res.body.deliveryFee)).toBe(8);
    }
  });

  it('dono da loja também não recebe CPF e e-mail do motoboy', async () => {
    const { lojista, orderId } = await setup();
    const res = await byOrder(lojista, orderId);
    expect(res.status).toBe(200);
    expect(res.body.motoboyCpf).toBeUndefined();
    expect(res.body.motoboyEmail).toBeUndefined();
  });

  it('o próprio motoboy e o CEO continuam vendo os dois campos', async () => {
    const { motoboy, admin, orderId } = await setup();
    for (const u of [motoboy, admin]) {
      const res = await byOrder(u, orderId);
      expect(res.status).toBe(200);
      expect(res.body.motoboyCpf).toBe('52998224725');
      expect(res.body.motoboyEmail).toBe('motoboy-h8@exemplo.test');
    }
  });
});
