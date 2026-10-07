/**
 * Regressão (riscos remanescentes 2026-10-07) — f08: limite de tentativas de PIN.
 * PIN de 5 dígitos sem limite = força bruta em minutos. Depois de 5 erros a entrega
 * fica 15 min sem aceitar PIN (nem o certo); acertar zera o contador.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { generatePin } from '../services/pinGuard';

const DOMAIN = '@sf08.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function entrega(status: 'assigned' | 'picked') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sf08', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status, motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321' },
  });
  return { dono, motoboy, delivery };
}

describe('f08 — PIN com limite de tentativas', () => {
  it('PIN de entrega: 5 erros travam; nem o certo passa durante a trava', async () => {
    const { motoboy, delivery } = await entrega('picked');
    const tentar = (pin: string) =>
      request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin });

    for (let i = 0; i < 5; i++) expect((await tentar(String(10000 + i))).status).toBe(400);
    const travado = await tentar('12345');
    expect(travado.status).toBe(429);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))?.status).toBe('picked');
  });

  it('PIN de retirada (loja): 5 erros travam', async () => {
    const { dono, delivery } = await entrega('assigned');
    const tentar = (pinRetirada: string) =>
      request(app).post(`/api/deliveries/${delivery.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada });

    for (let i = 0; i < 5; i++) expect((await tentar(String(20000 + i))).status).toBe(400);
    expect((await tentar('54321')).status).toBe(429);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))?.status).toBe('assigned');
  });

  it('acertar antes do limite zera o contador', async () => {
    const { dono, delivery } = await entrega('assigned');
    const tentar = (pinRetirada: string) =>
      request(app).post(`/api/deliveries/${delivery.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada });
    for (let i = 0; i < 4; i++) await tentar(String(30000 + i));
    expect((await tentar('54321')).status).toBe(200);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))?.pinFailedAttempts).toBe(0);
  });

  it('generatePin gera N dígitos', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePin(5)).toMatch(/^\d{5}$/);
      expect(generatePin(6)).toMatch(/^\d{6}$/);
    }
  });
});
