/**
 * Regressão (riscos remanescentes 2026-10-07) — f09: freio `gamificationPointsEnabled`.
 * O freio do admin (/admin/freios) pausava só a tela; os pontos por entrega finalizada
 * e por avaliação continuavam sendo creditados. Pontos viram benefício resgatável,
 * então é custo: com o freio desligado, nada é creditado.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { getPlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@sf09.test';
let original: boolean;
const motoboyIds: string[] = [];

beforeAll(async () => {
  original = !!(await getPlatformConfig())?.gamificationPointsEnabled;
});

afterEach(async () => {
  await prisma.gamification.deleteMany({ where: { userId: { in: motoboyIds.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

afterAll(async () => {
  await updatePlatformConfig({ gamificationPointsEnabled: original }, 'test');
});

async function finalizarUma() {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  motoboyIds.push(motoboy.userId);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sf09', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status: 'picked', motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321' },
  });
  const res = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
  expect(res.status).toBe(200);
  const avaliacao = await request(app).post(`/api/deliveries/${delivery.id}/avaliar`).set('Authorization', bearer(cliente)).send({ rating: 5 });
  expect(avaliacao.status).toBe(200);
  return prisma.gamification.findUnique({ where: { userId: motoboy.userId } });
}

describe('f09 — pontos respeitam o freio', () => {
  it('freio desligado: entrega e avaliação não geram pontos', async () => {
    await updatePlatformConfig({ gamificationPointsEnabled: false }, 'test');
    const g = await finalizarUma();
    expect(g?.points ?? 0).toBe(0);
  });

  it('freio ligado: pontos creditados normalmente', async () => {
    await updatePlatformConfig({ gamificationPointsEnabled: true }, 'test');
    const g = await finalizarUma();
    expect(g?.points).toBe(25); // 10 (entrega) + 15 (avaliação nota alta)
  });
});
