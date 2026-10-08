/**
 * Revisão final I5 — no modo direto, o admin precisa ver Payouts/Saques enquanto houver
 * repasse de custódia (Payout pending|released|requested) ou saque em aberto.
 * GET /api/admin/custody-open (payout:view) devolve o booleano e as contagens.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas45.test';
const ORDER_PREFIX = 'ord_45_';

afterEach(async () => {
  await prisma.payout.deleteMany({ where: { orderId: { startsWith: ORDER_PREFIX } } });
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyEmail: { endsWith: DOMAIN } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const get = (who: any) => request(app).get('/api/admin/custody-open').set('Authorization', bearer(who));

describe('GET /api/admin/custody-open', () => {
  it('conta Payout pending/released/requested (não paid/cancelled) e saque pending/approved', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const base = (await get(ceo)).body.data;
    expect(base).toEqual({ open: expect.any(Boolean), openPayouts: expect.any(Number), openWithdrawals: expect.any(Number) });

    for (const status of ['pending', 'released', 'requested', 'paid', 'cancelled'] as const) {
      await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: 'mb45', orderId: `${ORDER_PREFIX}${status}`, amount: 10, status } });
    }
    for (const status of ['pending', 'approved', 'processed', 'rejected'] as const) {
      await prisma.withdrawalRequest.create({ data: { motoboyId: 'mb45', motoboyName: 'M 45', motoboyEmail: `m45${status}${DOMAIN}`, amount: 10, status } });
    }

    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.openPayouts).toBe(base.openPayouts + 3);
    expect(r.body.data.openWithdrawals).toBe(base.openWithdrawals + 2);
    expect(r.body.data.open).toBe(true);
  });

  it('sem payout:view → 403; anônimo → 401', async () => {
    const lojista = await createTestUser('lojista', DOMAIN);
    expect((await get(lojista)).status).toBe(403);
    expect((await request(app).get('/api/admin/custody-open')).status).toBe(401);
  });
});
