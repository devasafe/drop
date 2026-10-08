/**
 * Lote pré-deploy 2 — item C: exclusão de loja transacional.
 * A checagem do aceite do termo e as remoções (produtos, categorias, loja) não estavam numa
 * transação: um aceite gravado entre a checagem e o delete fazia a FK Restrict recusar o
 * delete da loja DEPOIS que os produtos já tinham sido apagados (500 e loja pela metade).
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, get: jest.fn(), post: jest.fn(), getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { recordStoreConsent } from '../services/asaasLoja/account';
import { STORE_ASAAS_TERMS_VERSION } from '../legal/storeAsaasTerms';

const DOMAIN = '@saas52.test';
let owner: TestUser;
let storeId: string;

beforeEach(async () => {
  owner = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja t52' } })).id;
  await prisma.product.create({ data: { storeId, name: 'Item', price: 10, quantity: 1 } } as any);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function gate() {
  let open!: () => void;
  const p = new Promise<void>((r) => { open = r; });
  return { p, open };
}

describe('C — DELETE /api/stores/:id transacional', () => {
  it('aceite gravado entre a checagem e o delete → 409 STORE_HAS_CONSENT e os produtos continuam lá', async () => {
    const inserted = gate();
    const release = gate();
    // Aceite em andamento: trava a loja (como o aceite faz) e grava, mas ainda não commitou.
    const consentTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
      await tx.storeAsaasConsent.create({
        data: { storeId, actorId: owner.userId, actorRole: 'lojista', termsVersion: STORE_ASAAS_TERMS_VERSION },
      });
      inserted.open();
      await release.p;
    }, { timeout: 20000 });
    await inserted.p;

    const del = request(app).delete(`/api/stores/${storeId}`).set('Authorization', bearer(owner)).then((r) => r);
    await sleep(700); // o DELETE chega à loja travada
    release.open();
    await consentTx;
    const r = await del;

    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe('STORE_HAS_CONSENT');
    expect(await prisma.product.count({ where: { storeId } })).toBe(1);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(1);
    expect(await prisma.user.count({ where: { id: owner.userId } })).toBe(1);
  });

  it('aceite que chega com a exclusão em andamento espera a trava e recebe 404 (não erro de FK)', async () => {
    const locked = gate();
    const release = gate();
    // Exclusão em andamento: loja travada; o aceite concorrente tem de esperar.
    const delTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
      locked.open();
      await release.p;
      await tx.product.deleteMany({ where: { storeId } });
      await tx.store.delete({ where: { id: storeId } });
    }, { timeout: 20000 });
    await locked.p;

    const consent = recordStoreConsent({ storeId, actorId: owner.userId, actorRole: 'lojista', ip: null, userAgent: null })
      .then(() => 'gravou', (e) => e);
    await sleep(700);
    release.open();
    await delTx;
    const out: any = await consent;

    expect(out).not.toBe('gravou');
    expect(out?.statusCode).toBe(404);
    expect(out?.code).toBe('STORE_NOT_FOUND');
    expect(await prisma.storeAsaasConsent.count({ where: { storeId } })).toBe(0);
  });

  it('sem aceite: apaga produtos, loja e usuário na mesma transação', async () => {
    const r = await request(app).delete(`/api/stores/${storeId}`).set('Authorization', bearer(owner));
    expect(r.status).toBe(200);
    expect(await prisma.product.count({ where: { storeId } })).toBe(0);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(0);
    expect(await prisma.user.count({ where: { id: owner.userId } })).toBe(0);
  });
});
