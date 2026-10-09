/**
 * Pré-deploy item 2 — paginação por cursor (createdAt desc + id) nas listas:
 * GET /api/motoboy/transfers, /api/stores/:storeId/transfers, /api/admin/transfers e
 * /api/admin/direct-refunds. `data` continua array; `nextCursor` vem em campo irmão.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@saas47.test';
const PREFIX = 'ord47';

afterEach(async () => {
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { startsWith: PREFIX } } });
  await prisma.directRefund.deleteMany({ where: { orderId: { startsWith: PREFIX } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const owner = await createTestUser('lojista', DOMAIN);
  const otherOwner = await createTestUser('lojista', DOMAIN);
  const ceo = await createTestUser('ceo', DOMAIN);
  const m1 = await createTestUser('motoboy', DOMAIN);
  const m2 = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja 47', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  const otherStore = await prisma.store.create({ data: { ownerId: otherOwner.userId, name: 'Loja 47b', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  return { owner, otherOwner, ceo, m1, m2, store, otherStore };
}

let seq = 0;
// Datas fixas no passado distante (não colidem com linhas de outras suítes); duas linhas com o
// MESMO createdAt testam o desempate por id.
const BASE = Date.UTC(2001, 0, 1);
const at = (i: number) => new Date(BASE + Math.floor(i / 2) * 60_000);
const mkTransfer = (storeId: string, motoboyId: string, i: number, extra: any = {}) =>
  prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del47-${Date.now()}-${seq}`, orderId: `${PREFIX}-${seq++}`, storeId, motoboyId,
      amount: 8, pixKeyEncrypted: encryptSensitiveData('12345678912'), pixKeyType: 'CPF', createdAt: at(i), ...extra,
    },
  });

/** Percorre as páginas seguindo nextCursor; devolve as páginas (ids). */
async function walk(url: string, who: TestUser, limit: number, maxPages = 20) {
  const pages: string[][] = [];
  let cursor: string | null = null;
  for (let p = 0; p < maxPages; p++) {
    const sep = url.includes('?') ? '&' : '?';
    const r = await request(app)
      .get(`${url}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      .set('Authorization', bearer(who));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data)).toBe(true);
    pages.push(r.body.data.map((x: any) => x.id));
    cursor = r.body.nextCursor ?? null;
    if (!cursor) break;
  }
  return pages;
}

const sortedDesc = async (ids: string[], model: 'motoboyTransfer' | 'directRefund') => {
  const rows = await (prisma as any)[model].findMany({ where: { id: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
  return rows.map((r: any) => r.id);
};

describe('GET /api/motoboy/transfers — paginação', () => {
  it('3 páginas sem repetição nem perda, ordem createdAt desc; só os do próprio motoboy', async () => {
    const s = await setup();
    const mine: string[] = [];
    for (let i = 0; i < 6; i++) {
      mine.push((await mkTransfer(s.store.id, s.m1.userId, i)).id);
      await mkTransfer(s.store.id, s.m2.userId, i); // de outro motoboy, intercalado
    }
    const pages = await walk('/api/motoboy/transfers', s.m1, 2);
    expect(pages).toHaveLength(3);
    pages.forEach((p) => expect(p).toHaveLength(2));
    expect(pages.flat()).toEqual(await sortedDesc(mine, 'motoboyTransfer'));
  });

  it('sem limit: comportamento antigo (tudo numa página, nextCursor null)', async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) await mkTransfer(s.store.id, s.m1.userId, i);
    const r = await request(app).get('/api/motoboy/transfers').set('Authorization', bearer(s.m1));
    expect(r.body.data).toHaveLength(3);
    expect(r.body.nextCursor).toBeNull();
  });

  it('cursor inválido → 400; limit acima do teto é limitado', async () => {
    const s = await setup();
    const bad = await request(app).get('/api/motoboy/transfers?cursor=lixo').set('Authorization', bearer(s.m1));
    expect(bad.status).toBe(400);
    const big = await request(app).get('/api/motoboy/transfers?limit=100000').set('Authorization', bearer(s.m1));
    expect(big.status).toBe(200);
  });
});

describe('GET /api/stores/:storeId/transfers — paginação', () => {
  it('3 páginas sem repetição nem perda; só as da própria loja; outro lojista 403', async () => {
    const s = await setup();
    const mine: string[] = [];
    for (let i = 0; i < 5; i++) {
      mine.push((await mkTransfer(s.store.id, s.m1.userId, i)).id);
      await mkTransfer(s.otherStore.id, s.m1.userId, i);
    }
    const pages = await walk(`/api/stores/${s.store.id}/transfers`, s.owner, 2);
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(pages.flat()).toEqual(await sortedDesc(mine, 'motoboyTransfer'));
    const r = await request(app).get(`/api/stores/${s.store.id}/transfers?limit=2`).set('Authorization', bearer(s.otherOwner));
    expect(r.status).toBe(403);
  });
});

describe('GET /api/admin/transfers — paginação', () => {
  it('com filtro de status: páginas sem repetição e todas as linhas da suíte aparecem uma vez', async () => {
    const s = await setup();
    const mine: string[] = [];
    for (let i = 0; i < 6; i++) {
      mine.push((await mkTransfer(s.store.id, s.m1.userId, i, { status: 'failed_final' })).id);
      await mkTransfer(s.store.id, s.m1.userId, i, { status: 'done' });
    }
    const pages = await walk('/api/admin/transfers?status=failed_final', s.ceo, 2, 500);
    const all = pages.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((id) => mine.includes(id))).toEqual(await sortedDesc(mine, 'motoboyTransfer'));
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });
});

describe('GET /api/admin/direct-refunds — paginação', () => {
  it('3 páginas sem repetição nem perda', async () => {
    const s = await setup();
    const mine: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await prisma.directRefund.create({
        data: { orderId: `${PREFIX}-dr-${seq++}`, storeId: s.store.id, asaasPaymentId: `pay47-${seq}`, amount: 10, requestedBy: 'system', status: 'failed_final', createdAt: at(i) },
      });
      mine.push(r.id);
    }
    const pages = await walk('/api/admin/direct-refunds?status=failed_final', s.ceo, 2, 500);
    const all = pages.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((id) => mine.includes(id))).toEqual(await sortedDesc(mine, 'directRefund'));
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });
});
