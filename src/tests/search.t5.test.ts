/**
 * Task 5 (DS v2) — busca no servidor (produtos e lojas) + sugestões.
 *  - GET /api/search: pg_trgm + unaccent quando existem; senão ILIKE sobre translate() (sem acento).
 *  - GET /api/search/suggest: 5 produtos, 3 lojas, até 5 categorias.
 *  - Filtros da vitrine (KYC e mensalidade no modo direto) com AND nas duas rotas.
 *  - Texto do usuário sempre parametrizado (injeção = 200 sem erro).
 * Os testes rodam no caminho que o banco tiver (real com extensão) e no fallback forçado por mock.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';
import * as extensions from '../services/search/extensions';

const DOMAIN = '@search5.test';
const ORIGINAL_KYC = process.env.KYC_ENFORCED;

// Loja no Rio; ~1 grau de latitude = 111,19 km.
const LAT = -22.9;
const LNG = -43.2;
const north = (km: number) => String(LAT + km / 111.19);

let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED;
  else process.env.KYC_ENFORCED = ORIGINAL_KYC;
});
beforeEach(async () => {
  jest.restoreAllMocks();
  process.env.KYC_ENFORCED = 'true';
  await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function makeStore(data: Record<string, unknown> = {}) {
  return prisma.store.create({
    data: {
      ownerId: await ownerIdForStore(DOMAIN), name: 'Loja Busca T5', isOpen: true, isVerified: true,
      latitude: String(LAT), longitude: String(LNG), ...data,
    } as any,
  });
}

async function makeProduct(storeId: string, name: string, price: number, extra: Record<string, unknown> = {}) {
  return prisma.product.create({ data: { storeId, name, price, quantity: 5, ...extra } as any });
}

const ids = (res: request.Response) => (res.body.data.items as any[]).map((i) => i.id);
const search = (qs: Record<string, string | number>) => request(app).get('/api/search').query(qs);

describe('GET /api/search — produtos', () => {
  it('"fone", "FÔNE" e "fon" acham "Fone JBL"', async () => {
    const store = await makeStore();
    const fone = await makeProduct(store.id, 'Fone JBL', 199.9);
    for (const q of ['fone', 'FÔNE', 'fon']) {
      const res = await search({ q, limit: 40 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(ids(res)).toContain(fone.id);
    }
  });

  it('formato: toApiProduct + storeName + discountPercent', async () => {
    const store = await makeStore({ name: 'Loja Formato Wq7' });
    const p = await makeProduct(store.id, 'Caixa Som Wq7', 80, { oldPrice: 100 });
    const res = await search({ q: 'som wq7' });
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i: any) => i.id === p.id);
    expect(item).toBeDefined();
    expect(item._id).toBe(p.id);
    expect(item.price).toBe(80);
    expect(item.oldPrice).toBe(100);
    expect(item.storeName).toBe('Loja Formato Wq7');
    expect(item.discountPercent).toBe(20);
  });

  it('loja pausada (modo direto) e loja não verificada (KYC) não aparecem', async () => {
    const ok = await makeStore();
    const pausada = await makeStore();
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    const semKyc = await makeStore({ isVerified: false });
    const a = await makeProduct(ok.id, 'Fone Kzt9 Visivel', 10);
    const b = await makeProduct(pausada.id, 'Fone Kzt9 Pausada', 10);
    const c = await makeProduct(semKyc.id, 'Fone Kzt9 SemKyc', 10);
    const res = await search({ q: 'kzt9', limit: 40 });
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(a.id);
    expect(ids(res)).not.toContain(b.id);
    expect(ids(res)).not.toContain(c.id);
  });

  it('custódia: a linha paused não esconde; KYC desligado: loja não verificada aparece', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    delete process.env.KYC_ENFORCED;
    const pausada = await makeStore({ isVerified: false });
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    const p = await makeProduct(pausada.id, 'Fone Kzt8 Custodia', 10);
    const res = await search({ q: 'kzt8' });
    expect(ids(res)).toContain(p.id);
  });

  it('faixa de preço e ordenação por preço', async () => {
    const store = await makeStore();
    const p10 = await makeProduct(store.id, 'Caneca Zqxw A', 10);
    const p30 = await makeProduct(store.id, 'Caneca Zqxw B', 30);
    const p50 = await makeProduct(store.id, 'Caneca Zqxw C', 50);

    const faixa = await search({ q: 'zqxw', minPrice: 20, maxPrice: 40 });
    expect(ids(faixa)).toEqual([p30.id]);

    const asc = await search({ q: 'zqxw', sort: 'price_asc' });
    expect(ids(asc)).toEqual([p10.id, p30.id, p50.id]);

    const desc = await search({ q: 'zqxw', sort: 'price_desc' });
    expect(ids(desc)).toEqual([p50.id, p30.id, p10.id]);
  });

  it('filtro por categoryName', async () => {
    const store = await makeStore();
    const cat = await prisma.category.create({ data: { storeId: store.id, name: 'Bebidas Ytq' } });
    const dentro = await makeProduct(store.id, 'Suco Ytq', 8, { categoryId: cat.id });
    const fora = await makeProduct(store.id, 'Pastel Ytq', 8);
    const res = await search({ q: 'ytq', categoryName: 'bebidas ytq' });
    expect(ids(res)).toEqual([dentro.id]);
    expect(ids(res)).not.toContain(fora.id);
  });

  it('paginação por cursor: página cheia + nextCursor até o fim', async () => {
    const store = await makeStore();
    const criados = [];
    for (const [i, preco] of [5, 6, 7, 8, 9].entries()) criados.push(await makeProduct(store.id, `Lapis Vbn${i}`, preco));
    const vistos: string[] = [];
    let cursor: string | undefined;
    let paginas = 0;
    do {
      const res = await search({ q: 'vbn', sort: 'price_asc', limit: 2, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      vistos.push(...ids(res));
      cursor = res.body.data.nextCursor ?? undefined;
      paginas++;
      if (cursor) expect(ids(res)).toHaveLength(2);
    } while (cursor && paginas < 10);
    expect(paginas).toBe(3);
    expect(vistos).toEqual(criados.map((p) => p.id));
  });

  it('ordenação por distância exige lat/lng e ordena pela loja mais perto', async () => {
    const longe = await makeStore({ latitude: north(8) });
    const perto = await makeStore({ latitude: north(1) });
    const pl = await makeProduct(longe.id, 'Pneu Hjk Longe', 10);
    const pp = await makeProduct(perto.id, 'Pneu Hjk Perto', 99);
    expect((await search({ q: 'hjk', sort: 'distance' })).status).toBe(400);
    const res = await search({ q: 'hjk', sort: 'distance', lat: LAT, lng: LNG });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([pp.id, pl.id]);
  });

  it('openNow=1 (com lat/lng) tira loja fechada', async () => {
    const aberta = await makeStore();
    const fechada = await makeStore({ isOpen: false });
    const a = await makeProduct(aberta.id, 'Bolo Pmn Aberta', 10);
    const f = await makeProduct(fechada.id, 'Bolo Pmn Fechada', 10);
    expect((await search({ q: 'pmn', openNow: 1 })).status).toBe(400);
    const res = await search({ q: 'pmn', openNow: 1, lat: LAT, lng: LNG });
    expect(ids(res)).toContain(a.id);
    expect(ids(res)).not.toContain(f.id);
  });

  it('validação: q com 1 caractere, q > 80, limit > 40 e cursor inválido = 400', async () => {
    expect((await search({ q: 'a' })).status).toBe(400);
    expect((await search({ q: 'x'.repeat(81) })).status).toBe(400);
    expect((await search({ q: 'fone', limit: 41 })).status).toBe(400);
    expect((await search({ q: 'fone', cursor: 'nao-e-base64-json' })).status).toBe(400);
  });

  it('injeção: q com aspas e comentário responde 200 sem erro', async () => {
    const res = await search({ q: "'; drop table x; --" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    const lojas = await search({ q: "'; drop table x; --", type: 'stores' });
    expect(lojas.status).toBe(200);
    const sug = await request(app).get('/api/search/suggest').query({ q: "'; drop table x; --" });
    expect(sug.status).toBe(200);
  });

  it('curingas do LIKE (% e _) são literais', async () => {
    const store = await makeStore();
    await makeProduct(store.id, 'Item Qwl comum', 10);
    const res = await search({ q: '%%' });
    expect(res.status).toBe(200);
    // "%%" não pode virar "tudo": nenhum item da suíte casa com o texto literal.
    const nossos = await prisma.product.findMany({ where: { store: { owner: { email: { endsWith: DOMAIN } } } }, select: { id: true } });
    for (const n of nossos) expect(ids(res)).not.toContain(n.id);
  });
});

describe('GET /api/search — lojas', () => {
  it('acha loja por nome sem acento/maiúscula; KYC e mensalidade valem; distanceKm com lat/lng', async () => {
    const ok = await makeStore({ name: 'Eletrônica Rtyu', latitude: north(2) });
    const semKyc = await makeStore({ name: 'Eletronica Rtyu Sem KYC', isVerified: false });
    const pausada = await makeStore({ name: 'Eletronica Rtyu Pausada' });
    // D3b-2b, onda final: `cancelled` não esconde mais por status (só a pausa do DROP); a mensalidade que some é a `paused`.
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    const res = await search({ q: 'ELETRONICA rtyu', type: 'stores', lat: LAT, lng: LNG });
    expect(res.status).toBe(200);
    const items = res.body.data.items as any[];
    const found = items.find((s) => s.id === ok.id);
    expect(found).toBeDefined();
    expect(found._id).toBe(ok.id);
    expect(found.distanceKm).toBeCloseTo(2, 0);
    expect(found.asaas).toBeUndefined();
    expect(found.cnpj).toBeUndefined();
    expect(ids(res)).not.toContain(semKyc.id);
    expect(ids(res)).not.toContain(pausada.id);
  });

  it('lojas por distância', async () => {
    const longe = await makeStore({ name: 'Padaria Uio Longe', latitude: north(9) });
    const perto = await makeStore({ name: 'Padaria Uio Perto', latitude: north(1) });
    const res = await search({ q: 'padaria uio', type: 'stores', sort: 'distance', lat: LAT, lng: LNG });
    expect(ids(res)).toEqual([perto.id, longe.id]);
  });
});

describe('GET /api/search/suggest', () => {
  it('limita a 5 produtos, 3 lojas e 5 categorias distintas', async () => {
    const stores = [];
    for (let i = 0; i < 4; i++) stores.push(await makeStore({ name: `Mercado Qsug ${i}` }));
    for (let i = 0; i < 7; i++) await makeProduct(stores[0].id, `Arroz Qsug ${i}`, 10 + i, { image: 'https://img/x.png', oldPrice: 30 });
    for (let i = 0; i < 6; i++) await prisma.category.create({ data: { storeId: stores[i % 4].id, name: `Qsug Categoria ${i}` } });
    // Nome repetido em outra loja conta uma vez só.
    await prisma.category.create({ data: { storeId: stores[1].id, name: 'Qsug Categoria 0' } });

    const res = await request(app).get('/api/search/suggest').query({ q: 'qsug' });
    expect(res.status).toBe(200);
    const { products, stores: lojas, categories } = res.body.data;
    expect(products).toHaveLength(5);
    expect(Object.keys(products[0]).sort()).toEqual(['id', 'image', 'name', 'oldPrice', 'price', 'storeId', 'storeName']);
    expect(typeof products[0].price).toBe('number');
    expect(lojas).toHaveLength(3);
    expect(Object.keys(lojas[0]).sort()).toEqual(['id', 'name', 'slug']);
    expect(lojas[0].slug).toMatch(/^mercado-qsug-\d$/);
    expect(categories.length).toBeLessThanOrEqual(5);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('não sugere loja pausada nem não verificada', async () => {
    const semKyc = await makeStore({ name: 'Doceria Xcv', isVerified: false });
    const pausada = await makeStore({ name: 'Doceria Xcv Pausada' });
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    await makeProduct(semKyc.id, 'Brigadeiro Xcv', 3);
    await prisma.category.create({ data: { storeId: pausada.id, name: 'Xcv Doces' } });
    const res = await request(app).get('/api/search/suggest').query({ q: 'xcv' });
    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
    expect(res.body.data.stores).toEqual([]);
    expect(res.body.data.categories).toEqual([]);
  });

  it('q com menos de 2 caracteres = 400', async () => {
    expect((await request(app).get('/api/search/suggest').query({ q: 'a' })).status).toBe(400);
  });
});

describe('detecção das extensões', () => {
  it('bate com o banco (caminho real quando a migration criou extensões e função)', async () => {
    extensions.resetSearchExtensionsCache();
    const exts = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent')`;
    const fn = await prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM pg_proc WHERE proname = 'immutable_unaccent'`;
    expect(await extensions.hasSearchExtensions()).toBe(exts.length === 2 && fn.length > 0);
  });

  it('falha na detecção não fica em cache: a próxima chamada tenta de novo', async () => {
    extensions.resetSearchExtensionsCache();
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('banco fora do ar'));
    expect(await extensions.hasSearchExtensions()).toBe(false);
    spy.mockRestore();
    // A migration criou extensões e função neste banco: a 2ª detecção as encontra.
    expect(await extensions.hasSearchExtensions()).toBe(true);
    // E agora o sucesso fica em cache (não consulta de novo).
    const again = jest.spyOn(prisma, '$queryRaw');
    expect(await extensions.hasSearchExtensions()).toBe(true);
    expect(again).not.toHaveBeenCalled();
  });
});

describe('fallback sem pg_trgm/unaccent (detecção mockada)', () => {
  beforeEach(() => {
    jest.spyOn(extensions, 'hasSearchExtensions').mockResolvedValue(false);
  });

  it('continua achando por acento e maiúscula', async () => {
    const store = await makeStore({ name: 'Ótica Mnb' });
    const fone = await makeProduct(store.id, 'Fone JBL Mnb', 199.9);
    const acento = await makeProduct(store.id, 'Pão de Açúcar Mnb', 5);
    for (const q of ['FÔNE JBL MNB', 'fone jbl mnb', 'fon']) {
      const res = await search({ q, limit: 40 });
      expect(res.status).toBe(200);
      expect(ids(res)).toContain(fone.id);
    }
    const sem = await search({ q: 'PAO DE ACUCAR mnb' });
    expect(ids(sem)).toContain(acento.id);
    const lojas = await search({ q: 'otica mnb', type: 'stores' });
    expect(ids(lojas)).toContain(store.id);
    const sug = await request(app).get('/api/search/suggest').query({ q: 'ÓTICA mnb' });
    expect(sug.status).toBe(200);
    expect(sug.body.data.stores.map((s: any) => s.id)).toContain(store.id);
    expect(extensions.hasSearchExtensions).toHaveBeenCalled();
  });

  it('injeção no fallback: 200', async () => {
    const res = await search({ q: "'; drop table x; --" });
    expect(res.status).toBe(200);
  });
});
