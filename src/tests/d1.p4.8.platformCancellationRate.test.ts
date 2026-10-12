/** D1 · P4.8 — média de cancelamento da plataforma (30 dias) ao lado da taxa da loja. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { platformCancellationRate } from '../controllers/analyticsController';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p48.test';
const DAY = 24 * 60 * 60 * 1000;
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function expectedRate(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const total = await prisma.order.count({ where: { createdAt: { gte: since } } });
  const cancelled = await prisma.order.count({ where: { createdAt: { gte: since }, status: { in: ['cancelado', 'rejeitado'] as any } } });
  return total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0;
}

describe('platformCancellationRate', () => {
  it('helper = cancelados+rejeitados / todos dos últimos 30 dias, de todas as lojas', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P48', isOpen: true } });
    const base = { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, paymentMethod: 'pix', paymentStatus: 'paid' };
    await prisma.order.create({ data: { ...base, status: 'cancelado' } as any });
    await prisma.order.create({ data: { ...base, status: 'rejeitado' } as any });
    await prisma.order.create({ data: { ...base, status: 'entregue' } as any });
    await prisma.order.create({ data: { ...base, status: 'cancelado', createdAt: new Date(Date.now() - 40 * DAY) } as any }); // fora do recorte

    const rate = await platformCancellationRate();
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThanOrEqual(100);
    expect(rate).toBeCloseTo(await expectedRate(), 1);
  });

  it('GET /api/analytics/store/overview traz platformCancellationRate ao lado da taxa da loja', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P48b', isOpen: true } });
    const r = await request(app).get('/api/analytics/store/overview').set('Authorization', bearer(dono));
    expect(r.status).toBe(200);
    expect(typeof r.body.platformCancellationRate).toBe('number');
    expect(r.body.platformCancellationRate).toBeGreaterThanOrEqual(0);
    expect(r.body.platformCancellationRate).toBeLessThanOrEqual(100);
    expect(r.body.platformCancellationRate).toBeCloseTo(await expectedRate(), 1);
    expect(r.body.current).toHaveProperty('cancellationRate');
  });
});
