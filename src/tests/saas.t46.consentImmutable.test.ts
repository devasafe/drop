/**
 * Pré-deploy item 1c — a prova do aceite do termo (StoreAsaasConsent) não some nem muda:
 * sem cascade com a loja e trigger no Postgres que só deixa INSERT.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@saas46.test';
let owner: TestUser;
let storeId: string;

beforeEach(async () => {
  owner = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({
    data: { ownerId: owner.userId, name: 'Loja t46', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  })).id;
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const consents = () => prisma.storeAsaasConsent.findMany({ where: { storeId } });

describe('item 1c — StoreAsaasConsent é imutável', () => {
  it('UPDATE direto no banco é recusado e a linha fica como estava', async () => {
    await grantStoreConsent(storeId);
    const [row] = await consents();
    await expect(prisma.$executeRaw`UPDATE "StoreAsaasConsent" SET "termsVersion" = 'adulterada' WHERE id = ${row.id}`).rejects.toThrow();
    await expect(prisma.storeAsaasConsent.update({ where: { id: row.id }, data: { actorId: 'outro' } })).rejects.toThrow();
    expect(await consents()).toEqual([row]);
  });

  it('DELETE direto no banco é recusado (inclusive deleteMany)', async () => {
    await grantStoreConsent(storeId);
    const [row] = await consents();
    await expect(prisma.$executeRaw`DELETE FROM "StoreAsaasConsent" WHERE id = ${row.id}`).rejects.toThrow();
    await expect(prisma.storeAsaasConsent.deleteMany({ where: { storeId } })).rejects.toThrow();
    expect(await consents()).toEqual([row]);
  });

  it('apagar a loja não apaga a prova em cascata (FK recusa)', async () => {
    await grantStoreConsent(storeId);
    await expect(prisma.store.delete({ where: { id: storeId } })).rejects.toThrow();
    expect(await consents()).toHaveLength(1);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(1);
  });

  it('DELETE /api/stores/:id com termo aceito → 409 STORE_HAS_CONSENT, nada apagado (nem produtos)', async () => {
    await grantStoreConsent(storeId);
    await prisma.product.create({ data: { storeId, name: 'Item', price: 10, quantity: 1 } } as any);
    const r = await request(app).delete(`/api/stores/${storeId}`).set('Authorization', bearer(owner));
    expect(r.status).toBe(409);
    expect(r.body.code ?? r.body.error?.code).toBe('STORE_HAS_CONSENT');
    expect(await consents()).toHaveLength(1);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(1);
    expect(await prisma.product.count({ where: { storeId } })).toBe(1);
    expect(await prisma.user.count({ where: { id: owner.userId } })).toBe(1);
  });

  it('DELETE /api/stores/:id sem termo aceito continua apagando loja e usuário', async () => {
    const r = await request(app).delete(`/api/stores/${storeId}`).set('Authorization', bearer(owner));
    expect(r.status).toBe(200);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(0);
  });
});
