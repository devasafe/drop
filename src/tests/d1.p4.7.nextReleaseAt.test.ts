/** D1 · P4.7 — nextReleaseAt: sem data previsível de liberação hoje (entrega ou admin) → null. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p47.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function setup() {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P47', isOpen: true } });
  await prisma.payout.create({ data: { recipientType: 'store', recipientId: store.id, orderId: `ord-p47-${Date.now()}`, amount: 50, status: 'pending' } as any });
  return { dono, store };
}

describe('GET /api/wallets/store/:id/summary — nextReleaseAt', () => {
  it.each([false, true])('autoApprovePayouts=%s: campo presente e null (sem prazo de liberação)', async (auto) => {
    await updatePlatformConfig({ autoApprovePayouts: auto } as any, 'test');
    const { dono, store } = await setup();
    const r = await request(app).get(`/api/wallets/store/${store.id}/summary`).set('Authorization', bearer(dono));
    expect(r.status).toBe(200);
    expect(r.body.pending).toBe(50);
    expect(r.body).toHaveProperty('nextReleaseAt', null);
  });
});
