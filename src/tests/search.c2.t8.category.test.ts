// src/tests/search.c2.t8.category.test.ts
/** Fase C2 — Task 8. Categoria sem termo, subcategoria, resumo com contagens e loja na sugestão. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@c2categoria.test';
const ORIGINAL_KYC = process.env.KYC_ENFORCED;
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED; else process.env.KYC_ENFORCED = ORIGINAL_KYC;
  await prisma.$disconnect();
});
beforeEach(async () => { process.env.KYC_ENFORCED = 'true'; await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test'); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

const tag = () => Math.random().toString(36).slice(2, 7);

async function cenario() {
  const t = tag();
  const CAT = `Fones Ç2 ${t}`;
  const SEM = `Sem fio ${t}`; const COM = `Com fio ${t}`;
  const lojas = [];
  for (const nome of [`Eletro ${t}`, `Tech ${t}`]) {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: nome, isOpen: true, isVerified: true } as any });
    const cat = await prisma.category.create({ data: { storeId: store.id, name: CAT } });
    lojas.push({ store, cat });
  }
  const [a, b] = lojas;
  await prisma.product.createMany({
    data: [
      { storeId: a.store.id, categoryId: a.cat.id, name: `Fone Azul ${t}`, price: 100, quantity: 3, subCategory: SEM },
      { storeId: a.store.id, categoryId: a.cat.id, name: `Fone Preto ${t}`, price: 120, quantity: 0, subCategory: SEM },
      { storeId: a.store.id, categoryId: a.cat.id, name: `Fone Fio ${t}`, price: 40, quantity: 5, subCategory: COM },
      { storeId: b.store.id, categoryId: b.cat.id, name: `Fone Tech ${t}`, price: 90, quantity: 2, subCategory: SEM },
      { storeId: b.store.id, categoryId: b.cat.id, name: `Fone Solto ${t}`, price: 80, quantity: 2 },
    ] as any,
  });
  return { CAT, SEM, COM, t, storeA: a.store };
}

it('categoria sem termo: devolve os produtos da categoria (todas as lojas)', async () => {
  const { CAT } = await cenario();
  const r = await request(app).get(`/api/search?type=products&limit=40&categoryName=${encodeURIComponent(CAT)}`);
  expect(r.status).toBe(200);
  expect(r.body.data.items).toHaveLength(5);
});

it('subCategory filtra dentro da categoria', async () => {
  const { CAT, SEM } = await cenario();
  const r = await request(app).get(`/api/search?type=products&limit=40&categoryName=${encodeURIComponent(CAT)}&subCategory=${encodeURIComponent(SEM)}`);
  expect(r.body.data.items).toHaveLength(3);
});

it('sem termo e sem categoria (ou buscando lojas): 400', async () => {
  expect((await request(app).get('/api/search?type=products')).status).toBe(400);
  expect((await request(app).get('/api/search?type=stores&categoryName=X')).status).toBe(400);
});

it('resumo da categoria: contagens e subcategorias (sem diferenciar acento/maiúscula)', async () => {
  const { CAT, SEM, COM } = await cenario();
  const r = await request(app).get(`/api/search/category?name=${encodeURIComponent(CAT.toLowerCase().replace('ç', 'c'))}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual({
    name: CAT, productCount: 5, storeCount: 2,
    subCategories: [{ name: SEM, count: 3 }, { name: COM, count: 1 }],
  });
});

it('sugestão de produto traz o nome da loja', async () => {
  const { t, storeA } = await cenario();
  const r = await request(app).get(`/api/search/suggest?q=${encodeURIComponent(`Fone Azul ${t}`)}`);
  expect(r.body.data.products.find((p: any) => p.name === `Fone Azul ${t}`)).toMatchObject({ storeName: storeA.name });
});
