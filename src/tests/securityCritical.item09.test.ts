/**
 * Regressão (auditoria de segurança 2026-10-07) — item 9: PINs só para quem deve ver.
 *   pinRetirada / pinDevolucao → só o motoboy daquela entrega
 *   pin (entrega)              → só o cliente daquele pedido
 *   loja, admin, outros motoboys → nenhum PIN
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@sec09.test';
const PIN_ENTREGA = '11111';
const PIN_RETIRADA = '22222';
const PIN_DEVOLUCAO = '333333';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

interface Cenario {
  dono: TestUser; cliente: TestUser; motoboy: TestUser; outroMotoboy: TestUser;
  storeId: string; orderId: string; deliveryId: string;
}

async function cenario(status: 'assigned' | 'pending' = 'assigned'): Promise<Cenario> {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const outroMotoboy = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: outroMotoboy.userId }, data: { isOnline: true } });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sec09', isOpen: true, isVerified: true } });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 9,
      status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid',
    },
  });
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id, status, motoboyId: status === 'assigned' ? motoboy.userId : null,
      fee: 9, distance: 4, pin: PIN_ENTREGA, pinRetirada: PIN_RETIRADA, pinDevolucao: PIN_DEVOLUCAO,
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  return { dono, cliente, motoboy, outroMotoboy, storeId: store.id, orderId: order.id, deliveryId: delivery.id };
}

const pins = (d: any) => ({ pin: d?.pin, pinRetirada: d?.pinRetirada, pinDevolucao: d?.pinDevolucao });

describe('Item 9 — GET /deliveries/:id', () => {
  it('loja não vê nenhum PIN', async () => {
    const c = await cenario();
    const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.dono));
    expect(res.status).toBe(200);
    expect(pins(res.body)).toEqual({ pin: undefined, pinRetirada: undefined, pinDevolucao: undefined });
  });

  it('cliente vê só o PIN de entrega', async () => {
    const c = await cenario();
    const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.cliente));
    expect(res.status).toBe(200);
    expect(pins(res.body)).toEqual({ pin: PIN_ENTREGA, pinRetirada: undefined, pinDevolucao: undefined });
  });

  it('motoboy atribuído vê o PIN de retirada, nunca o do cliente', async () => {
    const c = await cenario();
    const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.motoboy));
    expect(res.status).toBe(200);
    expect(res.body.pin).toBeUndefined();
    expect(res.body.pinRetirada).toBe(PIN_RETIRADA);
  });
});

describe('Item 9 — outras respostas', () => {
  it('GET /orders/:id: loja sem PIN; cliente só com o PIN de entrega', async () => {
    const c = await cenario();
    const loja = await request(app).get(`/api/orders/${c.orderId}`).set('Authorization', bearer(c.dono));
    expect(loja.status).toBe(200);
    expect(pins(loja.body.delivery)).toEqual({ pin: undefined, pinRetirada: undefined, pinDevolucao: undefined });

    const cli = await request(app).get(`/api/orders/${c.orderId}`).set('Authorization', bearer(c.cliente));
    expect(pins(cli.body.delivery)).toEqual({ pin: PIN_ENTREGA, pinRetirada: undefined, pinDevolucao: undefined });
  });

  it('GET /stores/dashboard não traz PIN de nenhum pedido', async () => {
    const c = await cenario();
    const res = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(c.dono));
    expect(res.status).toBe(200);
    const all = [...(res.body.orders || []), ...(res.body.history || [])];
    expect(all.length).toBeGreaterThan(0);
    for (const o of all) expect(pins(o.delivery)).toEqual({ pin: undefined, pinRetirada: undefined, pinDevolucao: undefined });
  });

  it('GET /deliveries/available (pool) não traz PIN antigo de entrega devolvida', async () => {
    const c = await cenario('pending');
    const res = await request(app).get('/api/deliveries/available').set('Authorization', bearer(c.outroMotoboy));
    expect(res.status).toBe(200);
    const mine = (res.body.deliveries || []).find((d: any) => String(d._id ?? d.id) === c.deliveryId);
    expect(mine).toBeDefined();
    expect(pins(mine)).toEqual({ pin: undefined, pinRetirada: undefined, pinDevolucao: undefined });
  });

  it('GET /deliveries/ongoing: motoboy vê o PIN de retirada, não o do cliente', async () => {
    const c = await cenario();
    const res = await request(app).get('/api/deliveries/ongoing').set('Authorization', bearer(c.motoboy));
    expect(res.status).toBe(200);
    const mine = res.body.deliveries.find((d: any) => String(d._id ?? d.id) === c.deliveryId);
    expect(mine.pin).toBeUndefined();
    expect(mine.pinRetirada).toBe(PIN_RETIRADA);
  });
});
