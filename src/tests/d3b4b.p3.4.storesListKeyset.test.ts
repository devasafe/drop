/**
 * D3b-4b · P3.4 — GET /admin/stores paginada no banco (spec 8 e 7.2). A ordem e o cursor keyset seguem o
 * campo gravado (needsAttention desc, name, id); os filtros viram where; nota, cancelamento, plano e motoboys
 * por perto saem só das lojas da página; o filtro no_courier calcula sobre as lojas abertas pela regra da
 * vitrine e pagina. Review Focus 1, 4 e 5 do mestre.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { DAY_MS, cleanupAccountsFixtures, createPerson, daysBefore, randomDigits } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { DISPATCH_MAX_KM } from '../services/dispatch';
import * as couriersNear from '../services/adminOps/couriersNear';

const DOMAIN = '@d3b4bp34.test';
const MARK = 'd3b4bp34';
const POINT = { latitude: '-23.5505', longitude: '-46.6333' };
let ceo: TestUser;
let tag: string;
let customerId: string;
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p34');
  ceo = await createTestUser('ceo', DOMAIN);
  tag = `p34${Date.now().toString(36)}${randomDigits(4)}`;
  customerId = await createPerson(DOMAIN, { name: `${tag} Cliente` });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

const list = (query: Record<string, string>) =>
  request(app).get('/api/admin/stores').query(query).set('Authorization', bearer(ceo));
const idsOf = (res: request.Response): string[] => {
  expect(res.status).toBe(200);
  return res.body.items.map((s: { id: string }) => s.id);
};
const byId = (res: request.Response) => new Map<string, any>(res.body.items.map((s: { id: string }) => [s.id, s]));
/** createOpsStore não verifica a loja, e o jest liga KYC_ENFORCED: sem isVerified a vitrine esconderia todas. */
async function store(name: string, data: { latitude?: string; longitude?: string } = {}) {
  const id = await createOpsStore(DOMAIN, { name: `${tag} ${name}`, ...data });
  await prisma.store.update({ where: { id }, data: { isVerified: true } });
  return id;
}
/** Grava a atenção direto, sem motivo real: prova que a lista lê o campo e não recalcula. */
const setAttention = (id: string, value: boolean) =>
  prisma.$executeRaw`UPDATE "Store" SET "needsAttention" = ${value} WHERE "id" = ${id}`;
const sorted = (xs: string[]) => [...xs].sort();

/** Percorre todas as páginas com o cursor e devolve os ids na ordem em que vieram. */
async function walk(query: Record<string, string>, limit: number): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res = await list({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    seen.push(...idsOf(res));
    cursor = res.body.nextCursor;
    if (!cursor) return seen;
  }
  throw new Error('o cursor não terminou');
}

describe('GET /admin/stores · ordem e cursor pelo campo gravado', () => {
  it('a ordem e o selo vêm de needsAttention, não de um recálculo na leitura', async () => {
    const cancela = await store('g-A cancela'); // 3 de 5 cancelados, mas nunca recalculada
    for (let i = 0; i < 5; i++) {
      await createOpsOrder({ customerId, storeId: cancela, status: i < 3 ? 'cancelado' : 'entregue', createdAt: daysBefore(new Date(), 1) });
    }
    const marcada = await store('g-Z marcada');
    await setAttention(marcada, true);
    const comum = await store('g-M comum');

    const res = await list({ q: `${tag} g-` });
    expect(idsOf(res)).toEqual([marcada, cancela, comum]);
    const by = byId(res);
    expect(by.get(marcada)).toEqual(expect.objectContaining({ attention: true }));
    expect(by.get(cancela)).toEqual(expect.objectContaining({ attention: false, cancelRate30d: 0.6 }));
  });

  it('nomes iguais: o id desempata e o cursor não repete nem pula (Review Focus 4)', async () => {
    const antes = await store('n-A');
    const iguais = [await store('n-B igual'), await store('n-B igual'), await store('n-B igual')];
    const depois = await store('n-C');
    const marcada = await store('n-B igual');
    await setAttention(marcada, true);
    // cuids só têm [a-z0-9]: o sort do JS e a collation do banco dão a mesma ordem.
    const expected = [marcada, antes, ...sorted(iguais), depois];

    expect(idsOf(await list({ q: `${tag} n-` }))).toEqual(expected);
    expect(await walk({ q: `${tag} n-` }, 1)).toEqual(expected);
    expect(await walk({ q: `${tag} n-` }, 2)).toEqual(expected);
  });

  it('a atenção muda entre páginas: a página 2 não quebra nem repete; quem subiu aparece ao recarregar (Review Focus 5)', async () => {
    const k1 = await store('k-1');
    const k2 = await store('k-2');
    const k3 = await store('k-3');
    const k4 = await store('k-4');
    const q = `${tag} k-`;

    const p1 = await list({ q, limit: '2' });
    expect(idsOf(p1)).toEqual([k1, k2]);
    await setAttention(k1, true); // já mostrada: não volta na página 2
    await setAttention(k3, true); // ainda não mostrada: sobe para o topo e fica fora desta leitura

    const p2 = await list({ q, limit: '2', cursor: p1.body.nextCursor });
    expect(idsOf(p2)).toEqual([k4]);
    expect(p2.body.nextCursor).toBeNull();
    expect(idsOf(await list({ q }))).toEqual([k1, k3, k2, k4]);
  });

  it('a pausa pelo admin muda a ordem e o filtro de atenção na hora, sem esperar o job', async () => {
    const a = await store('h-A');
    const b = await store('h-B');
    const pause = await request(app).post(`/api/admin/stores/${b}/pause`).set('Authorization', bearer(ceo)).send({ reason: 'Fraude em análise' });
    expect(pause.status).toBe(200);
    expect(idsOf(await list({ q: `${tag} h-` }))).toEqual([b, a]);
    expect(idsOf(await list({ q: `${tag} h-`, filter: 'attention' }))).toEqual([b]);
    await request(app).post(`/api/admin/stores/${b}/unpause`).set('Authorization', bearer(ceo)).send({});
    expect(idsOf(await list({ q: `${tag} h-`, filter: 'attention' }))).toEqual([]);
  });
});

describe('GET /admin/stores · filtros no banco', () => {
  it('attention, admin_paused e trial viram where, com take = limite + 1', async () => {
    const pausada = await store('f-pausada');
    await prisma.store.update({ where: { id: pausada }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
    const marcada = await store('f-marcada');
    await setAttention(marcada, true);
    const teste = await store('f-teste');
    await prisma.storeSaasBilling.create({ data: { storeId: teste, status: 'trialing', trialEndsAt: new Date(Date.now() + 7 * DAY_MS) } });
    await store('f-comum');
    const findMany = jest.spyOn(prisma.store, 'findMany');
    const lastListQuery = () => findMany.mock.calls.map(([args]) => args as any).filter((a) => a?.orderBy).pop();
    const q = `${tag} f-`;

    // A pausada foi gravada direto, sem recalcular: o filtro de atenção lê o campo, então só a marcada.
    expect(idsOf(await list({ q, filter: 'attention', limit: '5' }))).toEqual([marcada]);
    expect(JSON.stringify(lastListQuery().where)).toContain('"needsAttention":true');
    expect(lastListQuery().take).toBe(6);
    expect(lastListQuery().orderBy).toEqual([{ needsAttention: 'desc' }, { name: 'asc' }, { id: 'asc' }]);

    expect(idsOf(await list({ q, filter: 'admin_paused' }))).toEqual([pausada]);
    expect(JSON.stringify(lastListQuery().where)).toContain('"adminPausedAt":{"not":null}');

    expect(idsOf(await list({ q, filter: 'trial' }))).toEqual([teste]);
    expect(JSON.stringify(lastListQuery().where)).toContain('"status":"trialing"');
  });
});

describe('GET /admin/stores · números só da página', () => {
  it('os dois groupBy, o plano e os motoboys por perto consultam só as lojas da página', async () => {
    const ids: string[] = [];
    for (const n of ['p-1', 'p-2', 'p-3', 'p-4', 'p-5']) ids.push(await store(n, POINT));
    for (const id of ids) {
      await createOpsOrder({ customerId, storeId: id, status: 'entregue', createdAt: daysBefore(new Date(), 2) });
    }
    const groupBy = jest.spyOn(prisma.order as any, 'groupBy');
    const subscriptions = jest.spyOn(prisma.storeSubscription, 'findMany');
    const near = jest.spyOn(couriersNear, 'couriersNearStores');

    const res = await list({ q: `${tag} p-`, limit: '2' });
    const page = idsOf(res);
    expect(page).toEqual(ids.slice(0, 2));

    expect(groupBy).toHaveBeenCalledTimes(2);
    for (const [args] of groupBy.mock.calls) expect(sorted((args as any).where.storeId.in)).toEqual(sorted(page));
    expect(subscriptions).toHaveBeenCalledTimes(1);
    expect(sorted((subscriptions.mock.calls[0][0] as any).where.storeId.in)).toEqual(sorted(page));
    expect(near).toHaveBeenCalledTimes(1);
    const consulted = (near.mock.calls[0][0] as Array<{ id: string; lat: number | null; lng: number | null }>);
    expect(consulted.map((s) => s.id)).toEqual(page);
    expect(consulted[0]).toEqual({ id: page[0], lat: -23.5505, lng: -46.6333 });
  });

  it('nearbyRadiusKm vem do DISPATCH_MAX_KM; loja sem coordenada tem nearbyCouriers null (Review Focus 1)', async () => {
    const comPonto = await store('c-com ponto', POINT);
    const semPonto = await store('c-sem ponto');
    const res = await list({ q: `${tag} c-` });
    expect(res.status).toBe(200);
    expect(res.body.nearbyRadiusKm).toBe(DISPATCH_MAX_KM);
    const by = byId(res);
    expect(by.get(semPonto).nearbyCouriers).toBeNull();
    expect(by.get(comPonto).nearbyCouriers).toEqual({ online: expect.any(Number), free: expect.any(Number) });
  });
});

describe('GET /admin/stores?filter=no_courier', () => {
  it('só lojas abertas pela regra da vitrine, com ponto e 0 motoboy online; calcula sobre as abertas e pagina', async () => {
    const semA = await store('z-A aberta', POINT);
    const semB = await store('z-B aberta', POINT);
    const semC = await store('z-C aberta', POINT);
    const comMotoboy = await store('z-D com motoboy', POINT);
    const semPonto = await store('z-E sem ponto');
    const fechada = await store('z-F fechada', POINT);
    await prisma.store.update({ where: { id: fechada }, data: { isOpen: false } });
    const pausada = await store('z-G pausada', POINT);
    await prisma.store.update({ where: { id: pausada }, data: { pausedUntil: new Date(Date.now() + 3_600_000) } });
    const pelaDrop = await store('z-H drop', POINT);
    await prisma.store.update({ where: { id: pelaDrop }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
    const allClosed = Object.fromEntries(
      ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { closed: true }]),
    );
    const foraDoHorario = await store('z-I fora do horário', POINT);
    await prisma.store.update({ where: { id: foraDoHorario }, data: { operatingHours: allClosed } });
    const abertaForaDoHorario = await store('z-J aberta fora do horário', POINT);
    await prisma.store.update({
      where: { id: abertaForaDoHorario },
      data: { operatingHours: allClosed, openOverrideUntil: new Date(Date.now() + 3_600_000) },
    });

    const near = jest.spyOn(couriersNear, 'couriersNearStores').mockImplementation((async (stores: Array<{ id: string; lat: number | null; lng: number | null }>) =>
      new Map(stores.map((s) => [s.id, s.lat === null ? null : { online: s.id === comMotoboy ? 2 : 0, free: 0 }]))) as any);
    const q = `${tag} z-`;

    const first = await list({ q, filter: 'no_courier', limit: '2' });
    expect(idsOf(first)).toEqual([semA, semB]);
    expect(first.body.items.map((i: any) => i.nearbyCouriers)).toEqual([{ online: 0, free: 0 }, { online: 0, free: 0 }]);
    const second = await list({ q, filter: 'no_courier', limit: '2', cursor: first.body.nextCursor });
    expect(idsOf(second)).toEqual([semC, abertaForaDoHorario]);
    expect(second.body.nextCursor).toBeNull();

    // openStoresWithCoords (P2) olha o banco todo: confere só as lojas desta suíte. A sem ponto já sai ali
    // (Review Focus 1), e a pausada pelo DROP sai pela visibilidade da vitrine (R5 do mestre).
    const mine = new Set([semA, semB, semC, comMotoboy, semPonto, fechada, pausada, pelaDrop, foraDoHorario, abertaForaDoHorario]);
    const consulted = (near.mock.calls[0][0] as Array<{ id: string }>).map((s) => s.id).filter((id) => mine.has(id));
    expect(sorted(consulted)).toEqual(sorted([semA, semB, semC, comMotoboy, abertaForaDoHorario]));
    for (const id of [semPonto, fechada, pausada, pelaDrop, foraDoHorario]) expect(consulted).not.toContain(id);
  });
});
